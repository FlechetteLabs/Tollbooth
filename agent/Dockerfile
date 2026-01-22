# Agent container with pre-configured proxy settings
# Includes Node.js, Python, and common LLM agent tools

FROM ubuntu:22.04

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install base dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    ca-certificates \
    gnupg \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    jq \
    vim \
    nano \
    less \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install common global npm packages
RUN npm install -g \
    typescript \
    ts-node \
    @anthropic-ai/sdk \
    openai

# Install common Python packages
RUN pip3 install --no-cache-dir \
    anthropic \
    openai \
    requests \
    aider-chat

# Install codex and claude code
RUN npm install -g \
    @openai/codex \
    @anthropic-ai/claude-code

# Create workspace directory
WORKDIR /workspace

# Create directory for certificates
RUN mkdir -p /certs

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set proxy environment variables (will connect to proxy container)
ENV HTTP_PROXY=http://proxy:8080
ENV HTTPS_PROXY=http://proxy:8080
ENV http_proxy=http://proxy:8080
ENV https_proxy=http://proxy:8080

# Set CA certificate paths (certificate will be mounted at runtime)
ENV SSL_CERT_FILE=/certs/mitmproxy-ca-cert.pem
ENV REQUESTS_CA_BUNDLE=/certs/mitmproxy-ca-cert.pem
ENV NODE_EXTRA_CA_CERTS=/certs/mitmproxy-ca-cert.pem
ENV CURL_CA_BUNDLE=/certs/mitmproxy-ca-cert.pem

# Set a nice prompt to indicate we're in the agent container
ENV PS1='\[\033[1;36m\][agent-container]\[\033[0m\] \[\033[1;34m\]\w\[\033[0m\] $ '

# Default to bash shell
ENTRYPOINT ["/entrypoint.sh"]
CMD ["/bin/bash"]
