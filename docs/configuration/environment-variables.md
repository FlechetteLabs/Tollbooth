# Environment Variables

Configuration options for Tollbooth services.

## Backend

### Server Ports

| Variable | Default | Description |
|----------|---------|-------------|
| `REST_PORT` | 3000 | REST API port |
| `PROXY_WS_PORT` | 3001 | WebSocket for proxy connection |
| `FRONTEND_WS_PORT` | 3002 | WebSocket for frontend |
| `WS_MAX_PAYLOAD` | 209715200 | Max WebSocket payload (bytes) |

### ML Model

| Variable | Default | Description |
|----------|---------|-------------|
| `REFUSAL_MODEL_ID` | `Xenova/nli-deberta-v3-small` | Zero-shot classification model |
| `MODEL_CACHE_DIR` | `/app/models` | ML model cache directory |

Available models:

- `Xenova/nli-deberta-v3-xsmall` (~90MB, faster)
- `Xenova/nli-deberta-v3-small` (~180MB, default)
- `Xenova/bart-large-mnli` (~1.6GB, more accurate)

### Persistence

See [Data Persistence](persistence.md) for details.

| Variable | Default | Description |
|----------|---------|-------------|
| `TOLLBOOTH_DATA_PATH` | `/data` | Base path for persistent data |
| `TOLLBOOTH_PERSIST_TRAFFIC` | `true` | Persist traffic flows |
| `TOLLBOOTH_PERSIST_REPLAY` | `true` | Persist replay variants |
| `TOLLBOOTH_PERSIST_RULES` | `true` | Persist rules |
| `TOLLBOOTH_PERSIST_CONFIG` | `true` | Persist config files |
| `TOLLBOOTH_PERSIST_STORE` | `true` | Persist datastore entries |

## Frontend

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_BACKEND_URL` | `http://localhost:2000` | Backend REST API URL |
| `VITE_WS_URL` | `ws://localhost:2002` | Backend WebSocket URL |

## Proxy

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_WS_URL` | `ws://backend:3001` | Backend WebSocket URL |
| `MAX_BODY_SIZE` | 1048576 | Max body size to forward (bytes) |

Bodies larger than `MAX_BODY_SIZE` are truncated when sent to the backend. LLM API bodies are always included in full regardless of this setting.

## Agent Container

### Proxy (Auto-configured)

| Variable | Value |
|----------|-------|
| `HTTP_PROXY` | `http://proxy:8080` |
| `HTTPS_PROXY` | `http://proxy:8080` |
| `http_proxy` | `http://proxy:8080` |
| `https_proxy` | `http://proxy:8080` |

### CA Certificate (Auto-configured)

| Variable | Value |
|----------|-------|
| `SSL_CERT_FILE` | `/certs/mitmproxy-ca-cert.pem` |
| `REQUESTS_CA_BUNDLE` | `/certs/mitmproxy-ca-cert.pem` |
| `NODE_EXTRA_CA_CERTS` | `/certs/mitmproxy-ca-cert.pem` |
| `CURL_CA_BUNDLE` | `/certs/mitmproxy-ca-cert.pem` |

### API Keys (Pass-through)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Passed from host if set |
| `OPENAI_API_KEY` | Passed from host if set |
