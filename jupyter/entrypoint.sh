#!/bin/bash

# Jupyter container entrypoint script
# Sets up proxy certificates and starts Jupyter

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║              Tollbooth - Jupyter Notebook                  ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if certificate exists and is readable
if [ -f "/certs/mitmproxy-ca-cert.pem" ] && [ -r "/certs/mitmproxy-ca-cert.pem" ]; then
    echo -e "${GREEN}✓${NC} CA certificate found at /certs/mitmproxy-ca-cert.pem"
else
    echo -e "${YELLOW}⚠${NC} CA certificate not found at /certs/mitmproxy-ca-cert.pem"
    echo -e "${YELLOW}  Notebook API calls may fail SSL verification${NC}"
    echo -e "${YELLOW}  Run ./setup-certs.sh on the host to fix this${NC}"
    echo ""
fi

# Display proxy configuration
echo ""
echo -e "${BLUE}Proxy Configuration (for notebook code):${NC}"
echo -e "  HTTP_PROXY:          ${GREEN}$HTTP_PROXY${NC}"
echo -e "  HTTPS_PROXY:         ${GREEN}$HTTPS_PROXY${NC}"
echo -e "  REQUESTS_CA_BUNDLE:  ${GREEN}$REQUESTS_CA_BUNDLE${NC}"
echo ""

echo -e "${BLUE}Installed Python packages:${NC}"
pip list 2>/dev/null | grep -E "anthropic|tavily|requests|beautifulsoup4" | while read pkg ver; do
    echo -e "  • $pkg ($ver)"
done
echo ""

echo -e "${BLUE}Mounted directories:${NC}"
echo -e "  • /workspace    - Agent workspace (read/write)"
echo -e "  • /workspace/notebooks - Your notebooks directory"
echo -e "  • /data         - Tollbooth data (read-only)"
echo ""

echo -e "${BLUE}Traffic routing:${NC}"
echo -e "  • Jupyter web UI:  ${GREEN}Direct access (not proxied)${NC}"
echo -e "  • Notebook code:   ${GREEN}Routed through Tollbooth proxy${NC}"
echo ""

# Get the port from environment or default to 8888
JUPYTER_PORT=${JUPYTER_PORT:-8888}

echo -e "${CYAN}Starting Jupyter Notebook on port ${JUPYTER_PORT}...${NC}"
echo -e "${CYAN}Access at: http://localhost:${JUPYTER_PORT}${NC}"
echo -e "────────────────────────────────────────────────────────────────"
echo ""

# Start Jupyter with no authentication and allow remote access
exec jupyter notebook \
    --ip=0.0.0.0 \
    --port=${JUPYTER_PORT} \
    --no-browser \
    --NotebookApp.token='' \
    --NotebookApp.password='' \
    --NotebookApp.allow_origin='*' \
    --NotebookApp.allow_remote_access=True \
    --notebook-dir=/workspace/notebooks
