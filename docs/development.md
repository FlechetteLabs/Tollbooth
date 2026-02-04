# Development

Running Tollbooth without Docker for local development.

## Running Services Locally

### Backend

```bash
cd backend
npm install
npm run dev
```

The backend runs on:

- REST API: `http://localhost:3000`
- Proxy WebSocket: `ws://localhost:3001`
- Frontend WebSocket: `ws://localhost:3002`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`.

### Proxy

```bash
cd proxy
pip install -r requirements.txt
mitmdump -s addon.py --listen-port 8080
```

The proxy listens on `http://localhost:8080`.

## Environment Variables

When running locally, you may need to set these environment variables:

### Backend

```bash
export REST_PORT=3000
export PROXY_WS_PORT=3001
export FRONTEND_WS_PORT=3002
```

### Frontend

```bash
export VITE_BACKEND_URL=http://localhost:3000
export VITE_WS_URL=ws://localhost:3002
```

### Proxy

```bash
export BACKEND_WS_URL=ws://localhost:3001
```

## Development Workflow

1. Start all three services in separate terminals
2. Make changes to source files
3. Backend and frontend support hot reload
4. Proxy requires restart after changes to `addon.py`

## Testing with Local Agent

When running locally (not in Docker), configure your agent to use:

```bash
export HTTP_PROXY=http://localhost:8080
export HTTPS_PROXY=http://localhost:8080
export SSL_CERT_FILE=/path/to/tollbooth/certs/mitmproxy-ca-cert.pem
export NODE_EXTRA_CA_CERTS=/path/to/tollbooth/certs/mitmproxy-ca-cert.pem
```

## Building Docker Images

```bash
# Build all services
docker compose build

# Build specific service
docker compose build backend

# Build without cache
docker compose build --no-cache
```

## Project Structure

```
tollbooth/
├── backend/           # Node.js backend
│   ├── src/           # TypeScript source
│   │   ├── parsers.ts              # API provider parsers
│   │   ├── conversations.ts        # Conversation correlation & tree building
│   │   ├── intercept.ts            # Request/response interception
│   │   ├── rules.ts                # Rules engine
│   │   ├── storage.ts              # Traffic & data storage
│   │   ├── persistence.ts          # Disk persistence
│   │   ├── message-filter.ts       # Message content filters
│   │   └── refusal/                # Refusal detection system
│   └── Dockerfile
├── frontend/          # React frontend
│   ├── src/           # TypeScript/React source
│   │   ├── components/
│   │   │   ├── conversation/       # Conversation views (list, detail, tree, compare)
│   │   │   ├── intercept/          # Intercept queue
│   │   │   ├── rules/              # Rules editor
│   │   │   ├── traffic/            # Traffic list and detail
│   │   │   ├── settings/           # Settings view
│   │   │   └── shared/             # Shared components (annotations, etc.)
│   │   ├── hooks/                  # React hooks (WebSocket, etc.)
│   │   └── stores/                 # Zustand state stores
│   └── Dockerfile
├── proxy/             # mitmproxy addon
│   ├── addon.py       # Python addon script
│   └── Dockerfile
├── agent/             # Agent container
│   └── Dockerfile
├── docs/              # Documentation (MkDocs)
├── certs/             # Generated certificates
├── tollbooth-data/    # Persistent data (gitignored)
└── docker-compose.yml
```
