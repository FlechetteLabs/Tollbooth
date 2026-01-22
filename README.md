# Tollbooth

A transparent proxy system for inspecting, debugging, and modifying traffic from LLM-based coding agents. Works with Claude Code, Codex CLI, Cursor, Aider, and any other tool that calls LLM APIs.

## Features

- **Traffic Capture**: Intercepts all HTTP/HTTPS traffic through a transparent proxy
  - mitmproxy-based interception with automatic certificate generation
  - Full request/response headers and body capture
  - Configurable body size limits for non-LLM traffic

- **LLM API Parsing**: Automatically parses Anthropic, OpenAI (including Codex CLI), and Google API calls into structured conversations
  - Provider-specific parsers for Claude, GPT, Gemini, and Codex CLI APIs
  - Extracts messages, system prompts, tool definitions, and model parameters
  - Parses streaming SSE responses in real-time

- **Conversation View**: Groups related API calls into conversations based on message history correlation
  - Renders user messages, assistant responses, and system prompts
  - Displays tool use blocks with collapsible JSON input/output
  - Shows thinking blocks (for Claude extended thinking)
  - Token usage statistics per turn and conversation

- **Request/Response Interception**: Hold, inspect, modify, and forward (or drop) requests and responses in real-time
  - Three intercept modes: Passthrough, Intercept LLM, Intercept All
  - Edit headers, body, and status codes before forwarding
  - Bulk actions for managing multiple pending intercepts
  - 5-minute auto-forward timeout to prevent hangs

- **Rules Engine**: Automate traffic manipulation with pattern-based rules
  - Filter by host, path, method, headers, status code, body content, and response size
  - Actions: Passthrough, Intercept, Serve from Data Store, Modify Body & Headers, LLM Modification
  - Dynamic variables: `{{timestamp}}`, `{{uuid}}`, `{{request.host}}`, `{{env:VAR}}`
  - Multi-response modes: Single, Round Robin, Random, Sequential
  - Built-in rule testing with filter match visualization
  - Import/export rules as JSON, create from templates

- **LLM-Powered Modifications**: Use AI to dynamically generate or transform traffic
  - Two generation modes: Generate Once (cached) or Generate Live (every request)
  - Reusable prompt templates with `{{variable}}` interpolation
  - Generate mock responses from intercepted requests with one click
  - Transform existing datastore entries using LLM prompts

- **Data Store**: File-based storage for mock requests and responses
  - Save from traffic view or intercept queue
  - Create, edit, duplicate, and delete entries
  - Usage tracking shows which rules reference each entry
  - Transform entries with LLM for variations
  - Persisted to disk in `./datastore/` directory

- **LLM Chat**: Built-in chat interface with multi-provider support
  - Supports Anthropic, OpenAI, Google, and Ollama (local models)
  - Switch providers mid-conversation
  - Save responses directly to Data Store
  - Configurable temperature, max tokens, and custom base URLs

- **Prompt Templates**: Reusable prompts for mock generation and transformation
  - Default templates for common use cases
  - Custom templates with named variables and defaults
  - Used by rules engine, mock generator, and datastore transform

- **Refusal Detection**: ML-based detection of LLM refusals with automatic handling
  - Zero-shot classification using bundled transformers.js model
  - Configurable confidence threshold and tokens to analyze
  - Three actions: passthrough (log), prompt_user (queue for review), modify (auto-replace)
  - Analyzes both text and thinking content blocks
  - Pending refusals queue with manual review and alternate response generation

- **SSE Streaming Support**: Real-time display of streaming responses
  - Incremental content updates as chunks arrive
  - Accumulated view shows complete response
  - Provider-specific stream parsing (Anthropic, OpenAI, Google, Codex)

- **Original/Modified Diff View**: Compare original and modified traffic side-by-side
  - Toggle between Original, Modified, and Diff views
  - Syntax-highlighted diff with additions and deletions
  - Yellow banner indicates modified content

- **Agent Agnostic**: Works with any LLM agent without code modifications
  - Pre-configured Docker agent container with proxy settings
  - Manual setup instructions for Claude Code, Codex, Cursor, Aider, and more
  - System-wide CA certificate installation guides

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

## Prerequisites

- Docker and Docker Compose
- The LLM agent you want to inspect

## Quick Start

### 1. Generate Certificates

First, generate the mitmproxy CA certificate that will be used for HTTPS interception:

```bash
./setup-certs.sh
```

This creates certificates in the `./certs` directory. The important file is `mitmproxy-ca-cert.pem`.

### 2. Start the Inspector

```bash
docker compose up
```

This starts three services:
- **Proxy**: `localhost:8080` - The HTTP/HTTPS proxy
- **Backend API**: `localhost:2000` - REST API
- **Frontend**: `localhost:5173` - Web UI

### 3. Open the Web UI

Navigate to [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Run Your Agent

**Option A: Use the Agent Container (Recommended)**

The easiest way is to use the included agent container which has all proxy settings pre-configured:

```bash
# Run an interactive shell in the agent container
docker compose run --rm agent

# Or run a specific command
docker compose run --rm agent aider
```

**Option B: Configure Your Own Environment**

See the agent-specific instructions below.

---

## Using the Web UI

The web UI consists of seven main views accessible from the sidebar.

### Traffic View

The main view showing all HTTP/HTTPS traffic flowing through the proxy.

**Left Panel - Traffic List:**
- All requests with method, URL, status code, and timestamp
- Purple "LLM" badge indicates requests to known LLM API endpoints (Anthropic, OpenAI, Google, Codex CLI)
- Full-text search across headers and body content
- Filter by LLM API calls only

**Right Panel - Traffic Details:**
- **Headers Tab**: Request and response headers
- **Body Tab**: Request and response body with multiple display modes
- **Parsed Tab**: For LLM API calls, shows structured message format

**Display Modes:**
- **Raw**: Original content as-is
- **Pretty**: JSON formatted with indentation
- **Aggressive**: Parses embedded JSON in SSE responses
- **Insane**: Renders escaped newlines for deeply nested content

**Original/Modified View:**
When traffic has been modified (by rules or manual intercept):
- Toggle between **Original**, **Modified**, and **Diff** views
- Diff view highlights changes between original and modified content
- Yellow banner indicates when viewing modified content

**Actions:**
- **Save to Datastore**: Save the current request or response to the data store
- **Save as Rule**: Create a rule from the current traffic pattern
- **Mock This Endpoint**: One-click action that saves the response to datastore and creates a rule to serve it (combines save + rule creation)

### Conversations View

Groups LLM API calls into logical conversations based on message history correlation.

**Left Panel - Conversation List:**
- Conversations grouped by provider and model
- Turn count and timestamp
- Click to expand conversation details

**Right Panel - Conversation Details:**
- Full conversation with expandable turns showing:
  - User messages
  - Assistant responses
  - Tool use blocks (with collapsible input JSON)
  - Tool results
  - Thinking blocks (for Claude)
  - Token usage statistics

### Intercept View

Real-time interception and modification of requests and responses.

**Intercept Modes:**
- **Passthrough**: All traffic flows through unimpeded (default)
- **Intercept LLM**: Only hold requests to known LLM API endpoints
- **Intercept All**: Hold all requests for manual inspection

**Rules Mode:**
Toggle to enable/disable the rules engine. When enabled, traffic matching rules is processed automatically even in passthrough mode.

**Queue Management:**
- View all pending intercepts (requests and responses)
- Select multiple intercepts using checkboxes
- Bulk actions: Forward Selected, Drop Selected
- Selection helpers: All, None, Requests only, Responses only

**Intercept Detail Panel:**
When you select a pending intercept:
- View and edit headers (add, modify, delete)
- View and edit body content
- Edit status code (for responses)
- Toggle between Preview and Edit mode

**Actions:**
- **Forward**: Send the request/response as-is
- **Forward Modified**: Send with your edits applied
- **Drop**: Cancel the request entirely (requests only)
- **Save to Datastore**: Save the (edited) content to data store
- **Save as Rule**: Create a rule from this traffic pattern

**Timeout**: Intercepted requests auto-forward after 5 minutes to prevent hangs.

### Data Store View

File-based storage for mock requests and responses that can be served by rules.

**Tabs:**
- **Responses**: Stored HTTP responses (status code, headers, body)
- **Requests**: Stored HTTP requests (method, URL, headers, body)

**Features:**
- Create new entries manually or by uploading files
- Edit existing entries (description, headers, body, status code)
- Duplicate entries with a new key
- Delete entries (with warning if used by rules)
- View raw or pretty-printed JSON body
- Import/export entries as JSON files
- Entries are persisted to disk in `./datastore/` directory

**Usage Tracking:**
- Each entry shows a badge indicating how many rules reference it
- Detail panel shows "Used by" section listing rule names
- Warning displayed before deleting entries used by rules

**Usage:**
Stored responses can be served automatically by rules with the "Serve from Data Store" action, enabling mock/replay functionality.

### Rules View

Create and manage rules to automate traffic manipulation.

**Tabs:**
- **Request Rules**: Rules that apply to incoming requests
- **Response Rules**: Rules that apply to outgoing responses
- **LLM Rules**: Rules for detecting and handling LLM refusals (see Refusal Detection below)

**Rule Priority:**
Rules are evaluated in order (top to bottom). Drag and drop to reorder rules.

**Header Actions:**
- **Import**: Import rules from a JSON file (imported rules are disabled by default for safety)
- **Export**: Export all rules to a JSON file for backup or sharing
- **From Template**: Create rules from pre-configured templates:
  - Mock 500 Error, Mock 429 Rate Limit, Mock Empty Response
  - Log LLM Traffic, Replace Model Name, Strip Thinking Blocks
  - Intercept Anthropic API, Intercept OpenAI API
- **Duplicate**: Clone existing rules with a new ID

**Creating a Rule:**

1. **Basic Info:**
   - Name: Descriptive name for the rule
   - Direction: Request or Response
   - Enabled: Toggle to enable/disable

2. **Filters (all must match):**
   - **Host**: Match by hostname (exact, contains, or regex)
   - **Path**: Match by URL path (exact, contains, or regex)
   - **Method**: Match by HTTP method (exact, contains, or regex)
   - **Header**: Match by header key and value
   - **LLM API**: Filter to LLM API traffic only, non-LLM only, or any

3. **Response Filters (response rules only):**
   - **Status Code**: Match by exact code (200), range (>=400, 4xx, 400-499), or list (500,502,503)
   - **Body Contains**: Match if response body contains string or regex pattern
   - **Response Header**: Match response header values
   - **Response Size**: Filter by body size (greater/less than X bytes)

4. **Action Types:**
   - **Passthrough**: Log only, don't intercept
   - **Intercept**: Hold for manual editing
   - **Serve from Data Store**: Return a stored response instead of forwarding
   - **Modify Body & Headers**: Apply automatic modifications
   - **LLM Modification**: Use LLM to modify content (experimental)

**Modify Body & Headers Action:**
- **Replace Body**: Completely replace the body content
- **Body Find/Replace**: Multiple find/replace operations with optional regex
- **Header Modifications**:
  - **Set**: Add or overwrite a header
  - **Remove**: Delete a header
  - **Find/Replace**: Modify header value with find/replace

**Dynamic Variables in Modifications:**
Use variables in body replacements, find/replace values, and header values:
- `{{timestamp}}` - Current Unix timestamp in milliseconds
- `{{timestamp_iso}}` - Current ISO 8601 timestamp
- `{{uuid}}` - Random UUID v4
- `{{random_int:min:max}}` - Random integer in range
- `{{request.method}}`, `{{request.host}}`, `{{request.path}}`, `{{request.url}}`
- `{{request.header:name}}` - Get specific request header value
- `{{env:VAR_NAME}}` - Environment variable value

**Serve from Data Store:**
- Select from existing stored responses/requests with inline preview
- **Selection Mode** (response rules only):
  - **Single**: Always serve the same response (default)
  - **Round Robin**: Cycle through responses in order (1, 2, 3, 1, 2, 3...)
  - **Random**: Randomly pick a response each time (good for simulating flaky APIs)
  - **Sequential**: Serve in order, stay on last one (good for testing pagination)
- **Merge Mode** (request rules only):
  - **Merge**: Stored headers override incoming headers
  - **Replace**: Use only stored headers, discard incoming
- Warning indicator if selected datastore key doesn't exist

**Rule Testing:**
Test rules without real traffic using the built-in "Test Rule" section:
- Input test data: URL, method, headers, body, is_llm_api flag
- See which filters match or fail with detailed explanations
- Preview action results (modified body/headers, stored response)

**Inline Preview:**
Rules with "Serve from Data Store" action show expandable preview in the rule list displaying status code, headers count, and body preview.

### Refusal Detection (LLM Rules)

Automatically detect and handle LLM refusals using ML-based classification.

**How It Works:**
The system uses a zero-shot classification model (bundled in the Docker image) to analyze LLM responses for refusal patterns. Both text content and thinking blocks are analyzed.

**Creating an LLM Rule:**

1. **Basic Info:**
   - Name: Descriptive name for the rule
   - Enabled: Toggle to enable/disable

2. **Detection Settings:**
   - **Confidence Threshold**: Minimum confidence to trigger (0-1, default 0.7)
   - **Tokens to Analyze**: Number of tokens to analyze (0 = all tokens)

3. **Action:**
   - **Passthrough**: Log the refusal but forward response unchanged
   - **Prompt User**: Hold response in pending queue for manual review
   - **Modify**: Automatically generate an alternate response using configured LLM

4. **Fallback Config** (for Modify action):
   - Provider: Which LLM to use for generating alternate responses
   - Custom prompt: Template for generating replacements
   - System prompt: System instructions for the replacement LLM

5. **Filter** (optional):
   - Host: Match specific API hosts
   - Path: Match specific API paths
   - Model: Match specific model names
   - Provider: Match specific LLM providers (anthropic, openai, google)

**Pending Refusals Queue:**

When a rule's action is "Prompt User", detected refusals appear in the Pending Refusals queue:
- View original response and analysis results (confidence score, tokens analyzed)
- See which rule triggered the detection
- **Approve**: Forward the original response unchanged
- **Generate Alternative**: Use configured LLM to generate a replacement response
- **Forward Modified**: Send the generated or custom response instead

Pending refusals auto-forward after 5 minutes to prevent hangs.

**Visual Indicators:**

Traffic and conversation views show badges when refusals are detected:
- Orange "Refusal" badge: Refusal detected but not modified
- Purple "Modified" badge: Refusal was detected and response was replaced

### LLM Chat View

Built-in chat interface to interact with an LLM for generating mock data.

**Features:**
- Multi-turn conversation with context
- Token usage display
- Save assistant responses directly to Data Store
- Clear conversation history

**Use Cases:**
- Generate mock API responses
- Test prompts before creating rules
- Create realistic test data

**Requirement:** Configure LLM settings first in the Settings view.

### Settings View

Configure application settings.

**LLM Configuration:**
- **Provider**: Anthropic (Claude), OpenAI (GPT), or Google (Gemini)
- **API Key**: Your API key for the selected provider
- **Model**: Select from common models or enter a custom model name
- **Temperature**: Control response randomness (0-1)
- **Max Tokens**: Maximum tokens to generate

> **Warning**: API keys entered here are stored in **plaintext** in `datastore/settings.json`. Do not use this tool on shared or production systems. Consider using environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) instead, which are passed through to the agent container without being persisted to disk.

**Data Store Path:**
Shows the configured data store path (set via Docker volume mount).

---

## Using the Agent Container (Recommended)

The project includes a pre-configured Docker container for running LLM agents. This is the **easiest way** to use the inspector because all proxy environment variables and certificates are automatically configured.

### Starting the Agent Container

First, make sure the inspector services are running:

```bash
docker compose up -d
```

Then start an interactive shell in the agent container:

```bash
docker compose run --rm agent
```

You'll see a welcome message confirming the proxy configuration:

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

### Pre-installed Tools

The agent container comes with:

- **Node.js 20.x** with npm
- **Python 3** with pip
- **Aider** (pre-installed)
- **Anthropic SDK** (Node.js and Python)
- **OpenAI SDK** (Node.js and Python)
- **Git**, curl, and common development tools

### Installing Additional Agents

Inside the container, you can install additional agents:

```bash
# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Install Codex CLI
npm install -g @openai/codex

# Install other Python-based agents
pip install <agent-name>
```

### Passing API Keys

**Option 1: Environment variables on the host**

If you have `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set on your host machine, they're automatically passed to the container:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
docker compose run --rm agent
```

**Option 2: Pass them when running the container**

```bash
docker compose run --rm -e ANTHROPIC_API_KEY=sk-ant-... agent
```

**Option 3: Mount your API key files**

Uncomment the volume mounts in `docker-compose.yml`:

```yaml
volumes:
  - ~/.anthropic:/root/.anthropic:ro
  - ~/.openai:/root/.openai:ro
```

### Working with Your Project Files

The `./workspace` directory is mounted into the container at `/workspace`. Place your project files there:

```bash
# On your host machine
cp -r /path/to/your/project ./workspace/

# In the container
cd /workspace/your-project
aider  # or any other agent
```

Or mount a different directory by modifying `docker-compose.yml`:

```yaml
volumes:
  - /path/to/your/project:/workspace
```

### Running Specific Commands

You can run commands directly without an interactive shell:

```bash
# Run Aider on a specific project
docker compose run --rm -w /workspace/my-project agent aider

# Run a Python script
docker compose run --rm agent python3 /workspace/script.py

# Run a Node.js script
docker compose run --rm agent node /workspace/script.js
```

### Example: Using Aider

```bash
# Start the inspector
docker compose up -d

# Open the web UI
open http://localhost:5173

# In another terminal, run Aider in the agent container
docker compose run --rm -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY agent aider

# All Aider's API calls will now appear in the inspector UI!
```

---

## Configuring LLM Agents (Manual Setup)

All agents need two things:
1. Proxy environment variables pointing to `localhost:8080`
2. CA certificate configuration so the agent trusts the proxy's HTTPS interception

### Claude Code

Claude Code respects standard proxy environment variables. Set them before running:

```bash
# Set proxy
export HTTP_PROXY=http://localhost:8080
export HTTPS_PROXY=http://localhost:8080

# Set CA certificate (use absolute path)
export SSL_CERT_FILE=/path/to/tollbooth/certs/mitmproxy-ca-cert.pem
export NODE_EXTRA_CA_CERTS=/path/to/tollbooth/certs/mitmproxy-ca-cert.pem

# Now run Claude Code
claude
```

Or as a one-liner:

```bash
HTTP_PROXY=http://localhost:8080 \
HTTPS_PROXY=http://localhost:8080 \
SSL_CERT_FILE=$(pwd)/certs/mitmproxy-ca-cert.pem \
NODE_EXTRA_CA_CERTS=$(pwd)/certs/mitmproxy-ca-cert.pem \
claude
```

### OpenAI Codex CLI

```bash
export HTTP_PROXY=http://localhost:8080
export HTTPS_PROXY=http://localhost:8080
export SSL_CERT_FILE=/path/to/tollbooth/certs/mitmproxy-ca-cert.pem
export NODE_EXTRA_CA_CERTS=/path/to/tollbooth/certs/mitmproxy-ca-cert.pem

# Run Codex
codex
```

### Cursor

Cursor is an Electron app that uses Node.js internally. You can configure it via:

**Option 1: Launch from terminal with environment variables**

```bash
HTTP_PROXY=http://localhost:8080 \
HTTPS_PROXY=http://localhost:8080 \
NODE_EXTRA_CA_CERTS=/path/to/tollbooth/certs/mitmproxy-ca-cert.pem \
/path/to/cursor
```

**Option 2: Configure system proxy**

1. Set your system's HTTP/HTTPS proxy to `localhost:8080`
2. Install the CA certificate system-wide (see "Installing CA Certificate System-Wide" below)

### Aider

Aider uses Python's `requests` library:

```bash
export HTTP_PROXY=http://localhost:8080
export HTTPS_PROXY=http://localhost:8080
export REQUESTS_CA_BUNDLE=/path/to/tollbooth/certs/mitmproxy-ca-cert.pem
export SSL_CERT_FILE=/path/to/tollbooth/certs/mitmproxy-ca-cert.pem

# Run Aider
aider
```

### Continue (VS Code Extension)

Continue runs inside VS Code. Configure proxy in VS Code settings:

1. Open VS Code Settings (Ctrl+,)
2. Search for "proxy"
3. Set `Http: Proxy` to `http://localhost:8080`
4. For the CA certificate, set the environment variable before launching VS Code:

```bash
NODE_EXTRA_CA_CERTS=/path/to/tollbooth/certs/mitmproxy-ca-cert.pem code
```

### Cline (VS Code Extension)

Same as Continue - configure VS Code's proxy settings and launch with the CA cert environment variable.

### Custom Python Scripts

```python
import os
os.environ['HTTP_PROXY'] = 'http://localhost:8080'
os.environ['HTTPS_PROXY'] = 'http://localhost:8080'
os.environ['REQUESTS_CA_BUNDLE'] = '/path/to/certs/mitmproxy-ca-cert.pem'

# Now use anthropic/openai libraries as normal
from anthropic import Anthropic
client = Anthropic()
# ...
```

Or with `requests`:

```python
import requests

proxies = {
    'http': 'http://localhost:8080',
    'https': 'http://localhost:8080',
}

response = requests.get(
    'https://api.anthropic.com/v1/messages',
    proxies=proxies,
    verify='/path/to/certs/mitmproxy-ca-cert.pem'
)
```

### Custom Node.js Scripts

```javascript
process.env.HTTP_PROXY = 'http://localhost:8080';
process.env.HTTPS_PROXY = 'http://localhost:8080';
process.env.NODE_EXTRA_CA_CERTS = '/path/to/certs/mitmproxy-ca-cert.pem';

// Now use @anthropic-ai/sdk or openai as normal
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic();
// ...
```

---

## Installing CA Certificate System-Wide

For agents that don't respect environment variables, you may need to install the CA certificate system-wide.

### macOS

```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ./certs/mitmproxy-ca-cert.pem
```

### Ubuntu/Debian

```bash
sudo cp ./certs/mitmproxy-ca-cert.pem /usr/local/share/ca-certificates/mitmproxy-ca-cert.crt
sudo update-ca-certificates
```

### Fedora/RHEL

```bash
sudo cp ./certs/mitmproxy-ca-cert.pem /etc/pki/ca-trust/source/anchors/
sudo update-ca-trust
```

### Windows

1. Double-click `mitmproxy-ca-cert.pem`
2. Click "Install Certificate"
3. Select "Local Machine"
4. Select "Place all certificates in the following store"
5. Browse and select "Trusted Root Certification Authorities"
6. Finish the wizard

---

## Common Workflows

### Mocking API Responses

**Quick Method (One Click):**
1. **Capture a real response**: Make an API call through the proxy and find it in Traffic view
2. **Click "Mock This Endpoint"**: This automatically saves the response and creates a matching rule
3. **Enable Rules Mode**: Toggle on in Intercept view
4. Future requests to this endpoint will receive your mock response

**Manual Method:**
1. **Capture a real response**: Make an API call through the proxy and find it in Traffic view
2. **Save to Data Store**: Click "Save to Datastore" on the response
3. **Create a rule**: Go to Rules view and create a new Response rule
4. **Configure the rule**:
   - Set filters to match the target endpoint (host, path)
   - Set action to "Serve from Data Store"
   - Select your saved response
5. **Enable Rules Mode**: Toggle on in Intercept view
6. Future requests matching the rule will receive your mock response

### Modifying Requests/Responses Automatically

1. **Create a rule** in Rules view
2. **Set filters** to match target traffic
3. **Choose "Modify Body & Headers"** action
4. **Add modifications**:
   - Replace entire body, or
   - Add find/replace patterns (with optional regex)
   - Add header modifications (set, remove, or find/replace)
   - Use dynamic variables like `{{uuid}}`, `{{timestamp}}`, `{{request.host}}`
5. **Enable Rules Mode**
6. Traffic matching the rule is automatically modified

### Simulating Flaky APIs

Use response variations to test how your agent handles unreliable APIs:

1. **Create multiple stored responses** in Data Store:
   - A successful 200 response
   - A 500 error response
   - A 429 rate limit response
2. **Create a rule** with "Serve from Data Store" action
3. **Select "Random" mode** and add all your stored responses
4. **Enable Rules Mode**
5. Each request will randomly receive one of your responses

### Testing Pagination

Use sequential response mode to simulate paginated APIs:

1. **Store each page response** in Data Store (page1, page2, page3, etc.)
2. **Create a rule** with "Serve from Data Store" action
3. **Select "Sequential" mode** and add pages in order
4. **Enable Rules Mode**
5. First request gets page1, second gets page2, etc.

### Injecting Headers into Requests

Use stored requests to automatically inject authentication or other headers:

1. **Create a stored request** in Data Store with your desired headers (e.g., Authorization header)
2. **Create a Request rule** with "Serve from Data Store" action
3. **Set merge mode to "Merge"** so stored headers override incoming
4. **Enable Rules Mode**
5. All matching requests will have your stored headers injected

### Debugging Agent Behavior

1. Start the inspector and your agent
2. Watch traffic in real-time in Traffic view
3. Click on any request to see:
   - Full headers and body
   - Parsed LLM message format
   - Token usage
4. Switch to Conversations view to see the full conversation flow
5. If needed, enable Intercept mode to pause and inspect specific calls

### Prompt Engineering

1. Configure LLM settings with your API key
2. Use the Chat view to experiment with prompts
3. Save useful responses to Data Store
4. Create rules to inject these responses for testing

---

## API Endpoints

The backend exposes a REST API at `localhost:2000`:

### Traffic & Conversations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/traffic` | GET | Get all traffic flows |
| `/api/traffic/:flowId` | GET | Get single traffic flow |
| `/api/conversations` | GET | Get all conversations |
| `/api/conversations/:id` | GET | Get single conversation |
| `/api/clear` | POST | Clear all stored data |

### Intercept

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/intercept/mode` | GET | Get current intercept mode |
| `/api/intercept/mode` | POST | Set intercept mode |
| `/api/rules/enabled` | GET | Get rules enabled state |
| `/api/rules/enabled` | POST | Set rules enabled state |
| `/api/intercept/pending` | GET | Get pending intercepts |
| `/api/intercept/:flowId/forward` | POST | Forward intercepted request |
| `/api/intercept/:flowId/forward-modified` | POST | Forward with modifications |
| `/api/intercept/:flowId/drop` | POST | Drop intercepted request |

### Data Store

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/datastore/responses` | GET | List all stored responses |
| `/api/datastore/responses/:key` | GET | Get single response |
| `/api/datastore/responses` | POST | Save response |
| `/api/datastore/responses/:key` | PUT | Update response |
| `/api/datastore/responses/:key` | DELETE | Delete response |
| `/api/datastore/requests` | GET | List all stored requests |
| `/api/datastore/requests/:key` | GET | Get single request |
| `/api/datastore/requests` | POST | Save request |
| `/api/datastore/requests/:key` | PUT | Update request |
| `/api/datastore/requests/:key` | DELETE | Delete request |

### Rules

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rules` | GET | List all rules |
| `/api/rules/:id` | GET | Get single rule |
| `/api/rules` | POST | Create rule |
| `/api/rules/:id` | PUT | Update rule |
| `/api/rules/:id` | DELETE | Delete rule |
| `/api/rules/reorder` | POST | Reorder rules |

### Refusal Detection

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/refusal-rules` | GET | List all refusal rules |
| `/api/refusal-rules` | POST | Create refusal rule |
| `/api/refusal-rules/:id` | PUT | Update refusal rule |
| `/api/refusal-rules/:id` | DELETE | Delete refusal rule |
| `/api/pending-refusals` | GET | List pending refusals |
| `/api/pending-refusals/:id/approve` | POST | Approve (forward original) |
| `/api/pending-refusals/:id/modify` | POST | Reject and modify response |
| `/api/pending-refusals/:id/generate` | POST | Generate alternate response |

### Settings & Chat

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/settings` | GET | Get current settings |
| `/api/settings` | PUT | Update settings |
| `/api/settings/llm-status` | GET | Check if LLM is configured |
| `/api/chat` | POST | Send chat message |
| `/api/chat/complete` | POST | Simple completion |

### URL Log

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/urls` | GET | Get URL log (supports filtering) |
| `/api/urls/filters` | GET | Get available filter options |
| `/api/urls/export` | GET | Export URL log (`?format=csv` or `?format=json`) |

---

## Troubleshooting

### Agent can't connect / SSL errors

1. Verify the proxy is running: `curl -x http://localhost:8080 http://httpbin.org/get`
2. Check that the CA certificate path is absolute and the file exists
3. Try installing the CA certificate system-wide

### No traffic appears in the UI

1. Check that the frontend is connected (green dot in sidebar)
2. Verify the agent is actually using the proxy (check agent logs)
3. Check Docker logs: `docker compose logs -f`

### Streaming responses not updating

SSE streaming requires the proxy to forward chunks in real-time. If responses only appear after completion:
1. Check that the `content-type: text/event-stream` header is present
2. Verify the backend is receiving stream chunks in logs

### Intercept timeout

Requests auto-forward after 5 minutes to prevent indefinite hangs. If you need more time:
1. Forward the request
2. Re-enable intercept mode to catch the next one

### Rules not applying

1. Check that **Rules Mode** is enabled in Intercept view
2. Verify the rule is enabled (toggle switch is on)
3. Check rule filters match the traffic (host, path, method)
4. Check rule priority - rules are evaluated top to bottom

### Refusal detection not working

1. Check that refusal rules are enabled in the LLM Rules tab
2. Verify the confidence threshold isn't too high (try lowering to 0.5)
3. Check backend logs for analysis results: `docker compose logs -f backend`
4. For streaming responses, ensure the parser is correctly accumulating SSE chunks
5. If using keyword fallback: Check logs for "[RefusalManager] Ready (using keyword-based fallback detection)"

### Docker container won't start

```bash
# Check for port conflicts
lsof -i :8080
lsof -i :2000
lsof -i :5173

# Rebuild containers
docker compose down
docker compose build --no-cache
docker compose up
```

---

## Development

### Running without Docker

**Backend:**
```bash
cd backend
npm install
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Proxy:**
```bash
cd proxy
pip install -r requirements.txt
mitmdump -s addon.py --listen-port 8080
```

### Environment Variables

**Backend:**
- `REST_PORT`: REST API port (default: 3000)
- `PROXY_WS_PORT`: WebSocket port for proxy connection (default: 3001)
- `FRONTEND_WS_PORT`: WebSocket port for frontend connection (default: 3002)
- `DATASTORE_PATH`: Path to data store directory (default: ./datastore)
- `RULES_FILE_PATH`: Path to rules.json file (default: ./datastore/rules.json)
- `REFUSAL_RULES_PATH`: Path to refusal-rules.json file (default: ./datastore/refusal-rules.json)
- `REFUSAL_MODEL_ID`: Zero-shot classification model (default: Xenova/nli-deberta-v3-small)
- `MODEL_CACHE_DIR`: Directory for caching ML models (default: /app/models)

**Frontend:**
- `VITE_BACKEND_URL`: Backend REST API URL (default: http://localhost:2000)
- `VITE_WS_URL`: Backend WebSocket URL (default: ws://localhost:2002)

**Proxy:**
- `BACKEND_WS_URL`: Backend WebSocket URL (default: ws://backend:3001)
- `MAX_BODY_SIZE`: Max body size to forward in bytes (default: 1MB)

---

## Security Considerations

- The CA certificate allows the proxy to decrypt HTTPS traffic. **Do not install it system-wide on production machines.**
- API keys in intercepted traffic are visible in the UI. Use this tool only in development environments.
- The proxy has full access to request/response bodies including sensitive data.
- **LLM API keys configured via the Settings UI are stored in plaintext** in `datastore/settings.json`. This file is excluded from git by default, but exercise caution on shared systems. Prefer using environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) which are not persisted to disk.

---

## License

AGPL-3.0 - See [LICENSE](LICENSE) for details.
