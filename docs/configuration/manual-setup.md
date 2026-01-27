# Manual Agent Setup

Configure your own environment to use Tollbooth without the agent container.

## Requirements

All agents need:

1. Proxy environment variables pointing to `localhost:8080`
2. CA certificate configuration for HTTPS interception

## Environment Variables

Set these before running your agent:

```bash
export HTTP_PROXY=http://localhost:8080
export HTTPS_PROXY=http://localhost:8080
export SSL_CERT_FILE=$(pwd)/certs/mitmproxy-ca-cert.pem
export NODE_EXTRA_CA_CERTS=$(pwd)/certs/mitmproxy-ca-cert.pem
export REQUESTS_CA_BUNDLE=$(pwd)/certs/mitmproxy-ca-cert.pem
export CURL_CA_BUNDLE=$(pwd)/certs/mitmproxy-ca-cert.pem
```

!!! tip "Use Absolute Paths"
    Always use absolute paths for certificate files.

## Agent-Specific Instructions

### Claude Code

```bash
HTTP_PROXY=http://localhost:8080 \
HTTPS_PROXY=http://localhost:8080 \
SSL_CERT_FILE=$(pwd)/certs/mitmproxy-ca-cert.pem \
NODE_EXTRA_CA_CERTS=$(pwd)/certs/mitmproxy-ca-cert.pem \
claude
```

### OpenAI Codex CLI

```bash
HTTP_PROXY=http://localhost:8080 \
HTTPS_PROXY=http://localhost:8080 \
SSL_CERT_FILE=$(pwd)/certs/mitmproxy-ca-cert.pem \
NODE_EXTRA_CA_CERTS=$(pwd)/certs/mitmproxy-ca-cert.pem \
codex
```

### Aider

```bash
HTTP_PROXY=http://localhost:8080 \
HTTPS_PROXY=http://localhost:8080 \
REQUESTS_CA_BUNDLE=$(pwd)/certs/mitmproxy-ca-cert.pem \
SSL_CERT_FILE=$(pwd)/certs/mitmproxy-ca-cert.pem \
aider
```

### Cursor

**Option 1: Launch from Terminal**

```bash
HTTP_PROXY=http://localhost:8080 \
HTTPS_PROXY=http://localhost:8080 \
NODE_EXTRA_CA_CERTS=$(pwd)/certs/mitmproxy-ca-cert.pem \
/path/to/cursor
```

**Option 2: System Proxy**

1. Set system proxy to `localhost:8080`
2. Install CA certificate system-wide (see below)

### Continue / Cline (VS Code Extensions)

1. Open VS Code Settings
2. Search for "proxy"
3. Set `Http: Proxy` to `http://localhost:8080`
4. Launch VS Code with CA cert:

```bash
NODE_EXTRA_CA_CERTS=$(pwd)/certs/mitmproxy-ca-cert.pem code
```

### Custom Python Scripts

```python
import os
os.environ['HTTP_PROXY'] = 'http://localhost:8080'
os.environ['HTTPS_PROXY'] = 'http://localhost:8080'
os.environ['REQUESTS_CA_BUNDLE'] = '/path/to/certs/mitmproxy-ca-cert.pem'

from anthropic import Anthropic
client = Anthropic()
```

Or with requests:

```python
import requests

response = requests.get(
    'https://api.anthropic.com/v1/messages',
    proxies={
        'http': 'http://localhost:8080',
        'https': 'http://localhost:8080',
    },
    verify='/path/to/certs/mitmproxy-ca-cert.pem'
)
```

### Custom Node.js Scripts

```javascript
process.env.HTTP_PROXY = 'http://localhost:8080';
process.env.HTTPS_PROXY = 'http://localhost:8080';
process.env.NODE_EXTRA_CA_CERTS = '/path/to/certs/mitmproxy-ca-cert.pem';

const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic();
```

## System-Wide CA Certificate

For agents that don't respect environment variables.

### macOS

```bash
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  ./certs/mitmproxy-ca-cert.pem
```

### Ubuntu/Debian

```bash
sudo cp ./certs/mitmproxy-ca-cert.pem \
  /usr/local/share/ca-certificates/mitmproxy-ca-cert.crt
sudo update-ca-certificates
```

### Fedora/RHEL

```bash
sudo cp ./certs/mitmproxy-ca-cert.pem \
  /etc/pki/ca-trust/source/anchors/
sudo update-ca-trust
```

### Windows

1. Double-click `mitmproxy-ca-cert.pem`
2. Click "Install Certificate"
3. Select "Local Machine"
4. Select "Place all certificates in the following store"
5. Browse → "Trusted Root Certification Authorities"
6. Finish

!!! warning "Security"
    Only install the CA certificate system-wide on development machines. It allows the proxy to decrypt all HTTPS traffic.
