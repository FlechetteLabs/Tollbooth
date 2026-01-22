#!/bin/bash

# Generate mitmproxy CA certificates for HTTPS interception

CERT_DIR="./certs"

echo "Setting up mitmproxy certificates..."

# Create certs directory if it doesn't exist
mkdir -p "$CERT_DIR"

# Check if certificates already exist
if [ -f "$CERT_DIR/mitmproxy-ca-cert.pem" ]; then
    echo "Certificates already exist in $CERT_DIR"
    echo "To regenerate, delete the certs directory and run this script again."
    exit 0
fi

# Generate certificates using mitmproxy in a temporary container
# Run mitmdump briefly - it generates certs on first start
# Use timeout to exit after 2 seconds (certs are generated immediately on startup)
echo "Generating new CA certificates..."
timeout 2s docker run --rm -v "$(pwd)/$CERT_DIR:/home/mitmproxy/.mitmproxy" mitmproxy/mitmproxy \
    mitmdump --set confdir=/home/mitmproxy/.mitmproxy 2>/dev/null || true

# Fix permissions (mitmproxy container creates files as uid 1000)
if [ -d "$CERT_DIR" ]; then
    chmod -R a+r "$CERT_DIR" 2>/dev/null || true
fi

# Check if generation was successful
if [ -f "$CERT_DIR/mitmproxy-ca-cert.pem" ]; then
    echo ""
    echo "Certificates generated successfully!"
    echo ""
    echo "CA certificate location: $CERT_DIR/mitmproxy-ca-cert.pem"
    echo ""
    echo "To use with agents, set these environment variables:"
    echo "  export HTTP_PROXY=http://localhost:8080"
    echo "  export HTTPS_PROXY=http://localhost:8080"
    echo "  export SSL_CERT_FILE=$(pwd)/$CERT_DIR/mitmproxy-ca-cert.pem"
    echo "  export REQUESTS_CA_BUNDLE=$(pwd)/$CERT_DIR/mitmproxy-ca-cert.pem"
    echo "  export NODE_EXTRA_CA_CERTS=$(pwd)/$CERT_DIR/mitmproxy-ca-cert.pem"
    echo ""
else
    echo "Error: Certificate generation failed"
    echo "Contents of $CERT_DIR:"
    ls -la "$CERT_DIR"
    exit 1
fi
