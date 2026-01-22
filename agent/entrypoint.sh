#!/bin/bash

# Agent container entrypoint script
# Sets up proxy certificates and environment

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                 Tollbooth - Agent Container                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if certificate exists and is readable
if [ -f "/certs/mitmproxy-ca-cert.pem" ] && [ -r "/certs/mitmproxy-ca-cert.pem" ]; then
    echo -e "${GREEN}✓${NC} CA certificate found at /certs/mitmproxy-ca-cert.pem"

    # Add certificate to system trust store
    if [ ! -f "/usr/local/share/ca-certificates/mitmproxy-ca-cert.crt" ]; then
        echo -e "${YELLOW}→${NC} Installing CA certificate to system trust store..."
        cp /certs/mitmproxy-ca-cert.pem /usr/local/share/ca-certificates/mitmproxy-ca-cert.crt
        update-ca-certificates > /dev/null 2>&1
        echo -e "${GREEN}✓${NC} CA certificate installed to system trust store"
    fi

    # Verify Node.js can read the cert
    if node -e "require('fs').readFileSync('/certs/mitmproxy-ca-cert.pem')" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Node.js can read the certificate"
    else
        echo -e "${YELLOW}⚠${NC} Node.js cannot read the certificate file"
    fi
else
    echo -e "${YELLOW}⚠${NC} CA certificate not found or not readable at /certs/mitmproxy-ca-cert.pem"
    echo -e "${YELLOW}  Contents of /certs directory:${NC}"
    ls -la /certs/ 2>/dev/null || echo "    (directory does not exist)"
    echo ""
    echo -e "${YELLOW}  To fix this, run on the host:${NC}"
    echo -e "${YELLOW}    ./setup-certs.sh${NC}"
    echo ""
fi

# Display proxy configuration
echo ""
echo -e "${BLUE}Proxy Configuration:${NC}"
echo -e "  HTTP_PROXY:          ${GREEN}$HTTP_PROXY${NC}"
echo -e "  HTTPS_PROXY:         ${GREEN}$HTTPS_PROXY${NC}"
echo -e "  SSL_CERT_FILE:       ${GREEN}$SSL_CERT_FILE${NC}"
echo -e "  NODE_EXTRA_CA_CERTS: ${GREEN}$NODE_EXTRA_CA_CERTS${NC}"
echo -e "  REQUESTS_CA_BUNDLE:  ${GREEN}$REQUESTS_CA_BUNDLE${NC}"
echo ""

# Test proxy connection
echo -e "${YELLOW}→${NC} Testing proxy connection..."
if curl -s --max-time 5 -x $HTTP_PROXY http://httpbin.org/get > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Proxy connection successful"
else
    echo -e "${YELLOW}⚠${NC} Could not reach proxy (it may still be starting up)"
fi

echo ""
echo -e "${BLUE}Available tools:${NC}"
echo -e "  • Node.js $(node --version)"
echo -e "  • Python $(python3 --version | cut -d' ' -f2)"
echo -e "  • npm $(npm --version)"
echo -e "  • pip $(pip3 --version | cut -d' ' -f2)"
echo -e "  • git $(git --version | cut -d' ' -f3)"
echo ""

# Check for installed agents
echo -e "${BLUE}Installed LLM agents/libraries:${NC}"
if command -v aider &> /dev/null; then
    echo -e "  • aider $(aider --version 2>/dev/null || echo '(installed)')"
fi
if npm list -g @anthropic-ai/sdk &> /dev/null 2>&1; then
    echo -e "  • @anthropic-ai/sdk (npm)"
fi
if npm list -g openai &> /dev/null 2>&1; then
    echo -e "  • openai (npm)"
fi
if pip3 show anthropic &> /dev/null 2>&1; then
    echo -e "  • anthropic (pip)"
fi
if pip3 show openai &> /dev/null 2>&1; then
    echo -e "  • openai (pip)"
fi
echo ""

echo -e "${BLUE}To install additional agents:${NC}"
echo -e "  • Claude Code:  ${GREEN}npm install -g @anthropic-ai/claude-code${NC}"
echo -e "  • Codex CLI:    ${GREEN}npm install -g @openai/codex${NC}"
echo -e "  • Aider:        ${GREEN}(already installed)${NC}"
echo ""

echo -e "${BLUE}Your workspace is mounted at /workspace${NC}"
echo -e "${BLUE}All traffic will be routed through the inspector proxy${NC}"
echo ""
echo -e "${GREEN}Ready! Run your LLM agent commands below.${NC}"
echo -e "────────────────────────────────────────────────────────────────"
echo ""

# Execute the command passed to the container
exec "$@"
