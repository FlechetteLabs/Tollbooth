# Getting Started

This guide walks you through setting up Tollbooth and inspecting your first LLM agent traffic.

## Prerequisites

- Docker and Docker Compose
- An LLM agent you want to inspect

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/flechettelabs/tollbooth.git
cd tollbooth
```

### 2. Generate Certificates

The proxy needs a CA certificate to intercept HTTPS traffic:

```bash
./setup-certs.sh
```

This creates certificates in `./certs/`. The important file is `mitmproxy-ca-cert.pem`.

### 3. Start the Services

```bash
docker compose up
```

This starts three services:

| Service | URL | Description |
|---------|-----|-------------|
| Proxy | `localhost:8080` | HTTP/HTTPS proxy |
| Backend API | `localhost:2000` | REST API |
| Frontend | `localhost:5173` | Web UI |

### 4. Open the Web UI

Navigate to [http://localhost:5173](http://localhost:5173) in your browser.

You should see an empty traffic list. The green dot in the sidebar indicates the frontend is connected to the backend.

## Running Your Agent

### Option A: Use the Agent Container (Recommended)

The included agent container has all proxy settings pre-configured:

```bash
# Interactive shell
docker compose run --rm agent

# Or run a specific command
docker compose run --rm agent aider
```

You'll see a welcome message confirming the proxy is configured:

```
╔════════════════════════════════════════════════════════════╗
║                 Tollbooth - Agent Container                ║
╚════════════════════════════════════════════════════════════╝

✓ CA certificate found at /certs/mitmproxy-ca-cert.pem
✓ Proxy connection successful

Ready! Run your LLM agent commands below.
```

### Option B: Configure Your Environment

Set these environment variables before running your agent:

```bash
export HTTP_PROXY=http://localhost:8080
export HTTPS_PROXY=http://localhost:8080
export SSL_CERT_FILE=$(pwd)/certs/mitmproxy-ca-cert.pem
export NODE_EXTRA_CA_CERTS=$(pwd)/certs/mitmproxy-ca-cert.pem
export REQUESTS_CA_BUNDLE=$(pwd)/certs/mitmproxy-ca-cert.pem
```

Then run your agent normally.

See [Manual Agent Setup](configuration/manual-setup.md) for agent-specific instructions.

## Your First Inspection

1. With the UI open, run an agent command that makes an API call
2. Watch the traffic appear in real-time in the Traffic view
3. Click on a request to see details:
   - **Headers tab**: Request/response headers
   - **Body tab**: Raw or formatted body content
   - **Parsed tab**: For LLM APIs, shows the conversation in readable format

## What's Next?

- [Traffic View](features/traffic-view.md) - Learn about filtering and analyzing traffic
- [Intercept](features/intercept.md) - Modify requests and responses in real-time
- [Rules Engine](features/rules.md) - Automate traffic manipulation
- [Agent Container](configuration/agent-container.md) - Detailed container usage
