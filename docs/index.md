# Tollbooth

A transparent proxy for inspecting, debugging, and modifying network traffic—built for LLM agent research but applicable to any HTTP/HTTPS traffic.

Works with **Claude Code**, **Codex CLI**, **Cursor**, **Aider**, and any tool that makes network requests.

## What is Tollbooth?

Tollbooth is a man-in-the-middle proxy that captures **all network traffic** from the agent container, giving you complete visibility and control over every request and response.

While it was built for monitoring LLM agent communications (with automatic parsing of Anthropic, OpenAI, and Google API calls into readable conversations), Tollbooth intercepts **all HTTP/HTTPS traffic**—including requests made by tools that agents invoke, package managers, APIs, and any other network activity. This makes it useful for:

- **Agent research** - Understand what your LLM agent is actually doing
- **Security testing** - Inspect and modify traffic from any application in the container
- **Network debugging** - See exactly what's going over the wire
- **API development** - Mock responses, simulate errors, test edge cases

## Key Capabilities

- **Inspect All Traffic** - See every HTTP request from the container. LLM API calls are automatically parsed into readable conversations; other traffic is shown in raw format.

- **Modify Requests** - Intercept and edit any request before it reaches its destination. Change headers, bodies, or drop requests entirely.

- **Mock Responses** - Serve stored responses instead of forwarding requests. Test edge cases, simulate errors, or cache expensive calls.

- **Detect Refusals** - ML-powered detection of LLM refusals with automatic handling options.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   LLM Agent     │────▶│     Proxy       │────▶│   LLM API       │
│ (Claude Code,   │     │   (mitmproxy)   │     │ (Anthropic,     │
│  Cursor, etc.)  │◀────│                 │◀────│  OpenAI, etc.)  │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                │
                                │ WebSocket
                                ▼
                       ┌─────────────────┐
                       │     Backend     │
                       │   (Node.js)     │
                       └────────┬────────┘
                                │
                                │ WebSocket
                                ▼
                       ┌─────────────────┐
                       │    Frontend     │
                       │    (React)      │
                       └─────────────────┘
```

## Quick Start

```bash
# 1. Generate certificates
./setup-certs.sh

# 2. Start services
docker compose up

# 3. Open UI
open http://localhost:5173

# 4. Run your agent through the proxy
docker compose run --rm agent
```

[Get Started :material-arrow-right:](getting-started.md){ .md-button .md-button--primary }

## Supported Providers

Tollbooth automatically parses API calls from:

- **Anthropic** (Claude)
- **OpenAI** (GPT, Codex CLI)
- **Google** (Gemini)

Other HTTP traffic is captured but shown in raw format.

## License

AGPL-3.0 - See [LICENSE](https://github.com/flechettelabs/tollbooth/blob/main/LICENSE) for details.
