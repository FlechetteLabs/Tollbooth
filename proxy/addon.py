"""
mitmproxy addon for Tollbooth.

Intercepts HTTP/HTTPS traffic, forwards to backend via WebSocket,
and supports request/response interception and modification.

In mitmproxy 10.x, async hooks are awaited, which allows us to
block the flow until the user makes a decision in the UI.
"""

import asyncio
import json
import os
import time
from typing import Optional
from mitmproxy import http, ctx

import websockets
from websockets.exceptions import ConnectionClosed

# Known LLM API endpoints for targeted interception
LLM_API_HOSTS = [
    "api.anthropic.com",
    "api.openai.com",
    "generativelanguage.googleapis.com",
    "chatgpt.com",  # OpenAI Codex CLI
]

# Max body size to forward to backend - larger bodies are truncated
# Default: 1MB, configurable via MAX_BODY_SIZE env var (in bytes)
MAX_BODY_SIZE = int(os.environ.get("MAX_BODY_SIZE", 1 * 1024 * 1024))


class TrafficInspectorAddon:
    def __init__(self):
        self.backend_ws_url = os.environ.get("BACKEND_WS_URL", "ws://backend:3001")
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.ws_lock = asyncio.Lock()
        self.intercept_mode = "passthrough"  # passthrough | intercept_llm | intercept_all
        self.rules_enabled = False  # Whether to apply rules regardless of intercept mode
        self.pending_flows: dict[str, asyncio.Event] = {}
        self.flow_modifications: dict[str, dict] = {}
        self.response_pending: dict[str, asyncio.Event] = {}
        self.response_modifications: dict[str, dict] = {}
        self.streaming_flows: set[str] = set()
        self._message_handler_task: Optional[asyncio.Task] = None

    def _is_ws_connected(self) -> bool:
        """Check if WebSocket is connected."""
        if self.ws is None:
            return False
        try:
            # websockets 13+ (ClientConnection): check close_code
            if hasattr(self.ws, 'close_code'):
                return self.ws.close_code is None
            # websockets 10-12: check state
            if hasattr(self.ws, 'state'):
                try:
                    from websockets.protocol import State
                    return self.ws.state == State.OPEN
                except ImportError:
                    pass
            # Older versions: check closed property
            if hasattr(self.ws, 'closed'):
                return not self.ws.closed
            # Fallback: assume connected
            return True
        except Exception:
            return False

    async def ensure_ws_connection(self):
        """Ensure WebSocket connection to backend is established."""
        async with self.ws_lock:
            if not self._is_ws_connected():
                try:
                    self.ws = await websockets.connect(
                        self.backend_ws_url,
                        ping_interval=30,
                        ping_timeout=10,
                    )
                    ctx.log.info(f"Connected to backend at {self.backend_ws_url}")
                    # Start message handler if not running
                    if self._message_handler_task is None or self._message_handler_task.done():
                        self._message_handler_task = asyncio.create_task(self._handle_backend_messages())
                    # Brief wait to allow initial state sync from backend
                    await asyncio.sleep(0.1)
                except Exception as e:
                    ctx.log.error(f"Failed to connect to backend: {e}")
                    self.ws = None

    async def _handle_backend_messages(self):
        """Handle incoming messages from backend."""
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)
                    await self._process_backend_command(data)
                except json.JSONDecodeError:
                    ctx.log.error(f"Invalid JSON from backend: {message}")
        except ConnectionClosed:
            ctx.log.info("Backend WebSocket connection closed")
            self.ws = None
        except Exception as e:
            ctx.log.error(f"Error in backend message handler: {e}")
            self.ws = None

    async def _process_backend_command(self, data: dict):
        """Process command from backend."""
        cmd = data.get("cmd")
        ctx.log.info(f"Received command from backend: {cmd}")

        if cmd == "set_intercept_mode":
            self.intercept_mode = data.get("mode", "passthrough")
            ctx.log.info(f"Intercept mode set to: {self.intercept_mode}")

        elif cmd == "set_rules_enabled":
            self.rules_enabled = data.get("enabled", False)
            ctx.log.info(f"Rules enabled set to: {self.rules_enabled}")

        elif cmd == "forward":
            flow_id = data.get("flow_id")
            ctx.log.info(f"Forward command for flow {flow_id}")
            if flow_id in self.pending_flows:
                self.pending_flows[flow_id].set()
            elif flow_id in self.response_pending:
                self.response_pending[flow_id].set()

        elif cmd == "forward_modified":
            flow_id = data.get("flow_id")
            modifications = data.get("modifications", {})
            ctx.log.info(f"Forward modified command for flow {flow_id}")
            if flow_id in self.pending_flows:
                self.flow_modifications[flow_id] = modifications
                self.pending_flows[flow_id].set()
            elif flow_id in self.response_pending:
                self.response_modifications[flow_id] = modifications
                self.response_pending[flow_id].set()

        elif cmd == "drop":
            flow_id = data.get("flow_id")
            ctx.log.info(f"Drop command for flow {flow_id}")
            if flow_id in self.pending_flows:
                self.flow_modifications[flow_id] = {"drop": True}
                self.pending_flows[flow_id].set()

        elif cmd == "forward_response":
            flow_id = data.get("flow_id")
            ctx.log.info(f"Forward response command for flow {flow_id}")
            if flow_id in self.response_pending:
                self.response_pending[flow_id].set()

        elif cmd == "forward_response_modified":
            flow_id = data.get("flow_id")
            modifications = data.get("modifications", {})
            ctx.log.info(f"Forward response modified command for flow {flow_id}, has_body={('body' in modifications)}")
            if flow_id in self.response_pending:
                self.response_modifications[flow_id] = modifications
                self.response_pending[flow_id].set()
                ctx.log.info(f"Stored modifications for flow {flow_id}")
            else:
                ctx.log.warn(f"Flow {flow_id} not in response_pending, modifications may be lost")

        elif cmd == "replay_request":
            # Initiate a replay request from the proxy
            asyncio.create_task(self._handle_replay_request(data))

    async def send_to_backend(self, message: dict):
        """Send message to backend via WebSocket."""
        await self.ensure_ws_connection()
        if self._is_ws_connected():
            try:
                await self.ws.send(json.dumps(message))
            except Exception as e:
                ctx.log.error(f"Failed to send to backend: {e}")

    async def _handle_replay_request(self, data: dict):
        """
        Handle replay request command from backend.

        Makes an HTTP request and sends it through the normal traffic pipeline,
        including intercept support.
        """
        import httpx

        replay_id = data.get("replay_id")
        variant_id = data.get("variant_id")
        request_data = data.get("request", {})
        intercept_response = data.get("intercept_response", False)

        method = request_data.get("method", "GET")
        url = request_data.get("url")
        headers = request_data.get("headers", {})
        body = request_data.get("body")

        ctx.log.info(f"Replay request: {method} {url} (intercept={intercept_response})")

        if not url:
            ctx.log.error("Replay request missing URL")
            await self.send_to_backend({
                "type": "replay_response",
                "replay_id": replay_id,
                "variant_id": variant_id,
                "error": "Missing URL",
            })
            return

        # Generate a flow ID for this replay
        flow_id = f"replay_{replay_id}"

        # Build request data structure
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            host = parsed.hostname or ""
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
            path = parsed.path or "/"
            if parsed.query:
                path += "?" + parsed.query
        except Exception as e:
            ctx.log.error(f"Failed to parse URL: {e}")
            await self.send_to_backend({
                "type": "replay_response",
                "replay_id": replay_id,
                "variant_id": variant_id,
                "error": f"Invalid URL: {e}",
            })
            return

        is_llm = self.is_llm_api(host)

        # Send request info to backend
        request_info = {
            "flow_id": flow_id,
            "timestamp": time.time(),
            "request": {
                "method": method,
                "url": url,
                "host": host,
                "port": port,
                "path": path,
                "headers": headers,
                "content": body,
            },
            "is_llm_api": is_llm,
            "replay_source": {
                "variant_id": variant_id,
                "parent_flow_id": data.get("parent_flow_id"),
            },
        }

        await self.send_to_backend({
            "type": "request",
            "data": request_info,
        })

        # Make the actual HTTP request
        try:
            async with httpx.AsyncClient(timeout=60.0, verify=False) as client:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    content=body.encode() if body else None,
                )

                response_content = response.text
                response_headers = dict(response.headers)

                ctx.log.info(f"Replay response: {response.status_code} for {url}")

        except Exception as e:
            ctx.log.error(f"Replay request failed: {e}")
            await self.send_to_backend({
                "type": "replay_response",
                "replay_id": replay_id,
                "variant_id": variant_id,
                "flow_id": flow_id,
                "error": str(e),
            })
            return

        # Build response info
        response_info = {
            "flow_id": flow_id,
            "timestamp": time.time(),
            "request": request_info["request"],
            "response": {
                "status_code": response.status_code,
                "reason": response.reason_phrase or "",
                "headers": response_headers,
                "content": response_content,
            },
            "is_llm_api": is_llm,
            "replay_source": request_info["replay_source"],
        }

        # Check if we should intercept this response
        if intercept_response:
            # Create event for intercept wait
            event = asyncio.Event()
            self.response_pending[flow_id] = event

            ctx.log.info(f"Intercepting replay response for {flow_id}")

            # Notify backend that this response is being intercepted
            await self.send_to_backend({
                "type": "intercept_response",
                "data": response_info,
            })

            # Wait for backend decision
            try:
                await asyncio.wait_for(event.wait(), timeout=300)  # 5 minute timeout
                ctx.log.info(f"Replay response intercept released for {flow_id}")
            except asyncio.TimeoutError:
                ctx.log.warn(f"Replay response intercept timeout for {flow_id}")
            finally:
                self.response_pending.pop(flow_id, None)

            # Apply modifications if any
            if flow_id in self.response_modifications:
                mods = self.response_modifications.pop(flow_id)
                if "body" in mods:
                    response_info["response"]["content"] = mods["body"]
                    response_info["response_modified"] = True
                if "status_code" in mods:
                    response_info["response"]["status_code"] = mods["status_code"]
                    response_info["response_modified"] = True
                if "headers" in mods:
                    response_info["response"]["headers"].update(mods["headers"])
                    response_info["response_modified"] = True

        # Send final response to backend
        await self.send_to_backend({
            "type": "response",
            "data": response_info,
        })

        # Send replay completion notification
        await self.send_to_backend({
            "type": "replay_complete",
            "replay_id": replay_id,
            "variant_id": variant_id,
            "flow_id": flow_id,
            "success": True,
        })

    def should_intercept(self, host: str) -> bool:
        """Determine if request should be intercepted based on mode."""
        result = False
        if self.intercept_mode == "passthrough":
            result = False
        elif self.intercept_mode == "intercept_llm":
            result = any(h in host for h in LLM_API_HOSTS)
        elif self.intercept_mode == "intercept_all":
            result = True
        ctx.log.info(f"should_intercept({host}) mode={self.intercept_mode} -> {result}")
        return result

    def should_apply_rules(self) -> bool:
        """Check if rules should be applied (rules mode enabled)."""
        return self.rules_enabled

    def is_llm_api(self, host: str) -> bool:
        """Check if host is a known LLM API."""
        result = any(h in host for h in LLM_API_HOSTS)
        ctx.log.info(f"is_llm_api({host}) -> {result}")
        return result

    def _get_body_content(self, content: bytes | None, is_llm: bool = False) -> str | None:
        """Get body content, truncating if too large (unless it's an LLM API call)."""
        if not content:
            return None

        # Always include full content for LLM API calls
        if is_llm:
            try:
                return content.decode('utf-8', errors='replace')
            except Exception:
                return f"[Binary content, {len(content)} bytes]"

        # Truncate large non-LLM bodies
        if len(content) > MAX_BODY_SIZE:
            return f"[Content truncated, {len(content)} bytes total]"

        try:
            return content.decode('utf-8', errors='replace')
        except Exception:
            return f"[Binary content, {len(content)} bytes]"

    def flow_to_dict(self, flow: http.HTTPFlow, include_response: bool = False) -> dict:
        """Convert flow to dictionary for JSON serialization."""
        flow_id = flow.id
        request = flow.request
        is_llm = self.is_llm_api(request.host)

        data = {
            "flow_id": flow_id,
            "timestamp": time.time(),
            "request": {
                "method": request.method,
                "url": request.pretty_url,
                "host": request.host,
                "port": request.port,
                "path": request.path,
                "headers": dict(request.headers),
                "content": self._get_body_content(request.content, is_llm),
            },
            "is_llm_api": is_llm,
        }

        if include_response and flow.response:
            response = flow.response
            data["response"] = {
                "status_code": response.status_code,
                "reason": response.reason,
                "headers": dict(response.headers),
                "content": self._get_body_content(response.content, is_llm),
            }

        return data

    async def request(self, flow: http.HTTPFlow):
        """
        Handle incoming request.

        This is an async hook - mitmproxy will await it, blocking the flow
        until this method completes. This allows us to hold requests for
        user interaction in the UI.
        """
        flow_data = self.flow_to_dict(flow)
        original_request = flow_data.get("request")
        request_modified = False

        # Send request to backend for logging
        await self.send_to_backend({
            "type": "request",
            "data": flow_data,
        })

        # Check if we should intercept this request
        # Either: explicit intercept mode, or rules mode is enabled
        should_intercept = self.should_intercept(flow.request.host)
        should_apply = self.should_apply_rules()
        ctx.log.info(f"Request decision: should_intercept={should_intercept}, should_apply_rules={should_apply}, rules_enabled={self.rules_enabled}")
        if should_intercept or should_apply:
            flow_id = flow.id
            event = asyncio.Event()
            self.pending_flows[flow_id] = event

            ctx.log.info(f"Intercepting request: {flow.request.method} {flow.request.url}")

            # Notify backend that this request is being intercepted
            await self.send_to_backend({
                "type": "intercept_request",
                "data": flow_data,
            })

            # Wait for backend decision (with timeout)
            try:
                await asyncio.wait_for(event.wait(), timeout=300)  # 5 minute timeout
                ctx.log.info(f"Intercept released for flow {flow_id}")
            except asyncio.TimeoutError:
                ctx.log.warn(f"Intercept timeout for flow {flow_id}, forwarding")
            finally:
                self.pending_flows.pop(flow_id, None)

            # Apply modifications if any
            if flow_id in self.flow_modifications:
                mods = self.flow_modifications.pop(flow_id)
                if mods.get("drop"):
                    ctx.log.info(f"Dropping flow {flow_id}")
                    flow.kill()
                    return
                if "body" in mods:
                    ctx.log.info(f"Modifying request body for flow {flow_id}")
                    flow.request.set_text(mods["body"])
                    request_modified = True
                if "headers" in mods:
                    for k, v in mods["headers"].items():
                        flow.request.headers[k] = v
                    request_modified = True

            # If request was modified, send update to backend with original and modified data
            if request_modified:
                modified_flow_data = self.flow_to_dict(flow)
                await self.send_to_backend({
                    "type": "request_modified",
                    "data": {
                        "flow_id": flow.id,
                        "original_request": original_request,
                        "modified_request": modified_flow_data.get("request"),
                    },
                })

    def responseheaders(self, flow: http.HTTPFlow):
        """Handle response headers - detect streaming."""
        content_type = flow.response.headers.get("content-type", "")
        if "text/event-stream" in content_type:
            self.streaming_flows.add(flow.id)
            # NOTE: Stream interception disabled for now - it was breaking responses
            # The stream will pass through normally, we just mark it as streaming
            # for tracking purposes. Individual chunks won't be captured.
            # TODO: Fix stream interception to properly handle all chunk types
            # flow.response.stream = self._stream_response(flow)

    async def response(self, flow: http.HTTPFlow):
        """
        Handle response.

        This is an async hook - mitmproxy will await it, blocking the response
        from being sent to the client until this method completes.
        """
        ctx.log.info(f"Response hook: {flow.response.status_code} for {flow.request.url}")
        flow_data = self.flow_to_dict(flow, include_response=True)
        original_response = flow_data.get("response")
        response_modified = False
        ctx.log.info(f"Response data prepared, is_llm_api={flow_data.get('is_llm_api')}, has_content={bool(flow_data.get('response', {}).get('content'))}")

        # Mark streaming as complete if applicable
        if flow.id in self.streaming_flows:
            self.streaming_flows.discard(flow.id)
            flow_data["stream_complete"] = True

        # Check if we should intercept this response
        # Either: explicit intercept mode, or rules mode is enabled
        should_intercept = self.should_intercept(flow.request.host)
        should_apply = self.should_apply_rules()
        ctx.log.info(f"Response decision: should_intercept={should_intercept}, should_apply_rules={should_apply}, rules_enabled={self.rules_enabled}")
        if should_intercept or should_apply:
            flow_id = flow.id
            event = asyncio.Event()
            self.response_pending[flow_id] = event

            ctx.log.info(f"Intercepting response: {flow.response.status_code} for {flow.request.url}")

            # Notify backend that this response is being intercepted
            await self.send_to_backend({
                "type": "intercept_response",
                "data": flow_data,
            })

            # Wait for backend decision
            try:
                await asyncio.wait_for(event.wait(), timeout=300)  # 5 minute timeout
                ctx.log.info(f"Response intercept released for flow {flow_id}")
            except asyncio.TimeoutError:
                ctx.log.warn(f"Response intercept timeout for flow {flow_id}, forwarding")
            finally:
                self.response_pending.pop(flow_id, None)

            # Apply response modifications if any
            ctx.log.info(f"Checking for modifications: flow_id={flow_id} in response_modifications={flow_id in self.response_modifications}")
            if flow_id in self.response_modifications:
                mods = self.response_modifications.pop(flow_id)
                ctx.log.info(f"Found modifications for flow {flow_id}: keys={list(mods.keys())}")
                if "body" in mods:
                    ctx.log.info(f"Modifying response body for flow {flow_id}")
                    flow.response.set_text(mods["body"])
                    response_modified = True
                if "status_code" in mods:
                    flow.response.status_code = mods["status_code"]
                    response_modified = True
                if "headers" in mods:
                    for k, v in mods["headers"].items():
                        flow.response.headers[k] = v
                    response_modified = True

        # Send final response to backend for logging
        # Re-capture flow data after modifications
        final_flow_data = self.flow_to_dict(flow, include_response=True)
        if flow.id in self.streaming_flows or flow_data.get("stream_complete"):
            final_flow_data["stream_complete"] = True

        # Include original data if modified
        if response_modified:
            final_flow_data["original_response"] = original_response
            final_flow_data["response_modified"] = True
            ctx.log.info(f"Including original_response for flow {flow.id}: has_content={bool(original_response.get('content') if original_response else False)}")

        ctx.log.info(f"Sending response to backend for flow {flow.id}, modified={response_modified}, has_original={bool(final_flow_data.get('original_response'))}")
        await self.send_to_backend({
            "type": "response",
            "data": final_flow_data,
        })
        ctx.log.info(f"Response sent to backend for flow {flow.id}")


addons = [TrafficInspectorAddon()]
