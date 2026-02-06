# Jupyter notebook container for Tollbooth
# Traffic from notebook code goes through the proxy for visibility
# Jupyter web UI is accessed directly (not proxied)

FROM jupyter/minimal-notebook:latest

# Switch to root to install system packages
USER root

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create directories
RUN mkdir -p /certs /data

# Switch back to jovyan user (default Jupyter user)
USER ${NB_UID}

# Install Python packages for bug bounty and API work
RUN pip install --no-cache-dir \
    anthropic \
    tavily-python \
    requests \
    beautifulsoup4

# Copy entrypoint script
USER root
COPY entrypoint.sh /usr/local/bin/tollbooth-entrypoint.sh
RUN chmod +x /usr/local/bin/tollbooth-entrypoint.sh
USER ${NB_UID}

# Set proxy environment variables (will connect to proxy container)
# These affect outbound traffic from notebook code, not the Jupyter web UI
ENV HTTP_PROXY=http://proxy:8080
ENV HTTPS_PROXY=http://proxy:8080
ENV http_proxy=http://proxy:8080
ENV https_proxy=http://proxy:8080

# Set CA certificate paths (certificate will be mounted at runtime)
ENV SSL_CERT_FILE=/certs/mitmproxy-ca-cert.pem
ENV REQUESTS_CA_BUNDLE=/certs/mitmproxy-ca-cert.pem
ENV CURL_CA_BUNDLE=/certs/mitmproxy-ca-cert.pem

# Jupyter configuration - no authentication, allow all origins
ENV JUPYTER_TOKEN=""
ENV JUPYTER_ALLOW_ORIGIN="*"

WORKDIR /workspace

# Use custom entrypoint that wraps the default Jupyter startup
ENTRYPOINT ["/usr/local/bin/tollbooth-entrypoint.sh"]
