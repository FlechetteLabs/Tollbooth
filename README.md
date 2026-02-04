# Tollbooth

A transparent proxy for inspecting, debugging, and modifying network traffic—built for LLM agent research but applicable to any HTTP/HTTPS traffic.

Works with **Claude Code**, **Codex CLI**, **Cursor**, **Aider**, and any tool that makes network requests.

> **[Read the full documentation](https://flechettelabs.com/tollbooth)**

## What It Does

Tollbooth is a man-in-the-middle proxy that captures **all network traffic** from the agent container. While built for monitoring LLM agent communications (with automatic parsing of API calls into conversations), it intercepts everything—including requests from tools that agents invoke, package managers, and any other network activity. Useful for agent research, security testing, and network debugging.

- **Inspect All Traffic** - See every HTTP request. LLM API calls are parsed into readable conversations; other traffic shown raw.
- **Conversation Trees** - Visualize branching conversations with a gitflow-style tree view. Branches from retries, replays, and natural divergence are shown with merge connectors where paths reconverge.
- **Modify Requests** - Intercept and edit any request before it reaches its destination. Mark items as timeout-immune for extended inspection.
- **Mock Responses** - Serve stored responses instead of forwarding requests
- **Rules Engine** - Automated traffic handling with priority-based rules, static modifications, drop actions, and smart fall-through when modifications don't apply
- **Export Conversations** - Export conversations as JSON, Markdown, or styled HTML
- **Detect Refusals** - ML-powered detection of LLM refusals with automatic handling

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

## Documentation

Full documentation is available at **[flechettelabs.com/tollbooth](https://flechettelabs.com/tollbooth)**:

- [Getting Started](https://flechettelabs.com/tollbooth/getting-started/) - Prerequisites and setup
- [Features](https://flechettelabs.com/tollbooth/features/traffic-view/) - Traffic view, conversations, tree view, intercept, rules, and more
- [Configuration](https://flechettelabs.com/tollbooth/configuration/agent-container/) - Agent container, manual setup, environment variables
- [API Reference](https://flechettelabs.com/tollbooth/api-reference/) - REST API endpoints
- [Security](https://flechettelabs.com/tollbooth/security/) - Important security considerations

## Security Notice

This tool is designed for **research and development use only**. See the [Security](https://flechettelabs.com/tollbooth/security/) documentation for important information about:

- CA certificate scope (agent container only)
- Data persistence (traffic is written to disk)
- API key storage

## Glossopetrae Integration (Optional)

Tollbooth optionally integrates with [Glossopetrae](https://github.com/elder-plinius/GLOSSOPETRAE), a procedural xenolinguistics engine for decoding conlang text in agent communications.

```bash
# Enable Glossopetrae during build
ENABLE_GLOSSOPETRAE=true docker compose build

# Start with Glossopetrae enabled
ENABLE_GLOSSOPETRAE=true docker compose up
```

When enabled:
- Decode buttons appear in conversation and traffic views
- Configure language seeds in Settings → Glossopetrae
- Bidirectional translation (decode conlang→English, encode English→conlang in intercept)

## Future Improvements

- **Content-based message comparison**: The conversation compare view currently uses index-based comparison (message 0 vs message 0, etc.). A more sophisticated content-matching approach would detect insertions, deletions, and moves by comparing message content rather than position.

- **Glossopetrae steganography detection**: Glossopetrae supports hiding secret payloads in normal-looking conlang text. A future "Reveal Hidden" feature could detect and extract steganographic content.

- **Glossopetrae backend search/filter**: Enable searching and filtering traffic by decoded content (requires backend integration).

- **Glossopetrae rules matching**: Allow rules to match on decoded content for automated handling of conlang traffic.

## License

AGPL-3.0 - See [LICENSE](LICENSE) for details.
