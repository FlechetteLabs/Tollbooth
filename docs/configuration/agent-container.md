# Agent Container

The project includes a pre-configured Docker container for running LLM agents with all proxy settings automatically configured.

## Starting the Container

First, ensure Tollbooth services are running:

```bash
docker compose up -d
```

Then start the agent container:

```bash
# Interactive shell
docker compose run --rm agent

# Run a specific command
docker compose run --rm agent aider
```

## Welcome Message

On startup, you'll see:

```
╔════════════════════════════════════════════════════════════╗
║                 Tollbooth - Agent Container                ║
╚════════════════════════════════════════════════════════════╝

✓ CA certificate found at /certs/mitmproxy-ca-cert.pem
✓ Proxy connection successful

Proxy Configuration:
  HTTP_PROXY:          http://proxy:8080
  HTTPS_PROXY:         http://proxy:8080
  SSL_CERT_FILE:       /certs/mitmproxy-ca-cert.pem
  NODE_EXTRA_CA_CERTS: /certs/mitmproxy-ca-cert.pem
  REQUESTS_CA_BUNDLE:  /certs/mitmproxy-ca-cert.pem

Ready! Run your LLM agent commands below.
```

## Pre-installed Tools

| Tool | Description |
|------|-------------|
| Node.js 20.x | With npm |
| Python 3 | With pip |
| Aider | Pre-installed |
| Anthropic SDK | Node.js and Python |
| OpenAI SDK | Node.js and Python |
| Git | Version control |
| curl | HTTP client |

## Installing Additional Agents

Inside the container:

```bash
# Claude Code
npm install -g @anthropic-ai/claude-code

# Codex CLI
npm install -g @openai/codex

# Python agents
pip install <agent-name>
```

## Passing API Keys

### Option 1: Host Environment Variables

If set on your host, they're automatically passed:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
docker compose run --rm agent
```

### Option 2: Inline

```bash
docker compose run --rm -e ANTHROPIC_API_KEY=sk-ant-... agent
```

### Option 3: Mount Key Files

Uncomment in `docker-compose.yml`:

```yaml
volumes:
  - ~/.anthropic:/root/.anthropic:ro
  - ~/.openai:/root/.openai:ro
```

## Working with Project Files

### Default Workspace

The `./workspace` directory mounts to `/workspace`:

```bash
# On host
cp -r /path/to/project ./workspace/

# In container
cd /workspace/your-project
aider
```

### Custom Mount

Modify `docker-compose.yml`:

```yaml
volumes:
  - /path/to/your/project:/workspace
```

## Running Commands

### Interactive Shell

```bash
docker compose run --rm agent
```

### Direct Commands

```bash
# Run Aider
docker compose run --rm -w /workspace/my-project agent aider

# Run Python script
docker compose run --rm agent python3 /workspace/script.py

# Run Node.js script
docker compose run --rm agent node /workspace/script.js
```

## Example: Using Aider

```bash
# Terminal 1: Start Tollbooth
docker compose up -d
open http://localhost:5173

# Terminal 2: Run Aider
docker compose run --rm -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY agent aider

# All API calls appear in the Tollbooth UI
```

## Container Runs as Root

The agent container runs as root for flexibility:

- Install packages on the fly with `apt-get`
- No permission issues with mounted volumes

If you need non-root operation, see the Development documentation.
