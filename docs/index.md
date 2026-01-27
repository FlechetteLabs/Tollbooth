# Tollbooth

A transparent proxy for inspecting, debugging, and modifying traffic from LLM-based coding agents.

Works with **Claude Code**, **Codex CLI**, **Cursor**, **Aider**, and any tool that calls LLM APIs.

## What is Tollbooth?

Tollbooth sits between your LLM agent and the API provider, giving you complete visibility and control over every request and response. Think of it as browser DevTools for AI agents.

## Key Capabilities

- **Inspect Traffic** - See every HTTP request your agent makes, with automatic parsing of LLM API calls into readable conversations.

- **Modify Requests** - Intercept and edit requests before they reach the API. Change prompts, add headers, or drop requests entirely.

- **Mock Responses** - Serve stored responses instead of calling the real API. Test edge cases, simulate errors, or cache expensive calls.

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
