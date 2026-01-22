# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tollbooth is a transparent proxy system for inspecting, debugging, and modifying traffic from LLM-based coding agents (Claude Code, Codex, Cursor, Aider, etc.). It intercepts HTTPS traffic, parses LLM API calls, and presents them in a web UI with both raw and structured conversation views.

**Current Status:** Fully implemented and functional. `DesignDoc.md` contains the original specification.

## Architecture

```
Agent Container → Proxy (mitmproxy) → Backend (Node.js) → Frontend (React)
                        ↓                    ↓
                   WebSocket            WebSocket
                        └────────────────────┘
```

**Components:**
- **Proxy Layer:** mitmproxy with Python addon - intercepts HTTPS, handles SSE streaming, supports request/response modification
- **Backend Service:** Node.js + TypeScript - parses traffic, manages conversation state, correlates API calls into conversations
- **Web UI:** React + TypeScript + Tailwind - displays traffic, conversations, intercept queue, URL log

## Key Technical Decisions

- **Conversation correlation:** Requests are grouped by comparing message history prefixes + model matching (LLM APIs are stateless, each request contains full history)
- **Intercept modes:** PASSTHROUGH (default), INTERCEPT_LLM (known API endpoints only), INTERCEPT_ALL
- **Parser architecture:** Extensible `APIParser` interface with implementations for Anthropic, OpenAI, Google
- **State management:** React Query for server state, Zustand for UI state
- **Real-time updates:** WebSocket push from backend to frontend (no polling)

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Proxy | mitmproxy (Python addon) |
| Backend | Node.js + TypeScript |
| Frontend | React + TypeScript + Tailwind CSS |
| Real-time | WebSocket |
| Deployment | Docker Compose |
| ML | transformers.js (zero-shot classification) |

## Build Commands

```bash
docker compose up              # Start all services
./setup-certs.sh               # First-time certificate generation
```

## Project Structure

```
proxy/addon.py                 # mitmproxy addon script
backend/src/                   # Node.js backend
  parsers.ts                   # API provider parsers (Anthropic, OpenAI, Google, Codex)
  conversation-manager.ts      # Conversation correlation
  intercept-manager.ts         # Request/response modification
  storage.ts                   # Traffic, datastore, and rules storage
  refusal/                     # Refusal detection system
    analyzer.ts                # Zero-shot classification with transformers.js
    manager.ts                 # Rule management and pending queue
frontend/src/                  # React frontend
  components/                  # UI components
  hooks/                       # React hooks (useWebSocket, useTraffic, etc.)
  stores/                      # Zustand stores
```

## Design Principles

1. Traffic as source of truth (parse network traffic, not logs)
2. Agent-agnostic (works with any agent calling standard LLM APIs)
3. Non-invasive (requires zero agent modification - only proxy env vars)
4. Always inspectable (drill down to raw traffic)
5. Modifiable (intercept and edit traffic in real-time)

## Important Implementation Notes

- Agent containers need proxy env vars: `HTTP_PROXY`, `HTTPS_PROXY`, `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`, `NODE_EXTRA_CA_CERTS`
- SSE streaming requires special handling - accumulate chunks, parse provider-specific events
- Conversation correlation uses deep equality on message content
- Intercept has 5-minute timeout before auto-forwarding

## Refusal Detection System

The refusal detection feature uses ML-based zero-shot classification to detect when LLM responses contain refusals.

**Architecture:**
- `backend/src/refusal/analyzer.ts` - Zero-shot classification using transformers.js with `Xenova/nli-deberta-v3-small` model
- `backend/src/refusal/manager.ts` - Rule management, pending queue, alternate response generation
- Model is bundled in Docker image (no external API calls for detection)

**Key Implementation Details:**
- Analyzes both `text` and `thinking` content blocks for refusal patterns
- Handles both JSON and SSE (streaming) response formats
- SSE parsing in `parsers.ts` extracts content from `text_delta`, `thinking_delta`, and `input_json_delta` events
- Falls back to keyword-based detection if ML model unavailable

**Refusal Rules:**
- Configure via LLM Rules tab in Rules view
- Actions: `passthrough` (log only), `prompt_user` (hold for review), `modify` (auto-generate replacement)
- Filter by host, path, model, or provider
- Configurable confidence threshold (default 0.7) and tokens to analyze (0 = all)

**Pending Refusals Queue:**
- Separate from Intercept Queue
- 5-minute timeout before auto-forward
- Generate alternate response using configured LLM provider
