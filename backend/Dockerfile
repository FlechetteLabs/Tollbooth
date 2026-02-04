FROM node:20-slim

# Glossopetrae build arguments
ARG ENABLE_GLOSSOPETRAE=false
ARG GLOSSOPETRAE_VERSION=main
ARG GLOSSOPETRAE_REPO=https://github.com/elder-plinius/GLOSSOPETRAE.git

# Install build dependencies for native modules (needed by @xenova/transformers)
# Also install git if Glossopetrae is enabled
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    $(if [ "$ENABLE_GLOSSOPETRAE" = "true" ]; then echo "git"; fi) \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user (remove existing node user with UID 1000 first)
RUN userdel -r node && useradd -m -u 1000 -s /bin/bash azaz

WORKDIR /app

# Create models directory for bundled ML model
RUN mkdir -p /app/models

# Create data directory mount point
RUN mkdir -p /data

# Set environment variable for model cache
ENV MODEL_CACHE_DIR=/app/models

COPY package*.json ./
RUN npm install

# Copy scripts (model will be downloaded lazily at runtime)
COPY scripts ./scripts

COPY tsconfig.json ./
COPY src ./src

# Clone Glossopetrae if enabled
RUN if [ "$ENABLE_GLOSSOPETRAE" = "true" ]; then \
      echo "Installing Glossopetrae (version: $GLOSSOPETRAE_VERSION)..."; \
      mkdir -p /app/lib; \
      if [ "$GLOSSOPETRAE_VERSION" = "latest" ] || [ "$GLOSSOPETRAE_VERSION" = "main" ]; then \
        git clone --depth 1 "$GLOSSOPETRAE_REPO" /tmp/glossopetrae; \
      else \
        git clone --depth 1 --branch "$GLOSSOPETRAE_VERSION" "$GLOSSOPETRAE_REPO" /tmp/glossopetrae; \
      fi; \
      cp -r /tmp/glossopetrae/src /app/lib/glossopetrae; \
      rm -rf /tmp/glossopetrae; \
      echo "Glossopetrae installed successfully"; \
    else \
      echo "Glossopetrae disabled - skipping installation"; \
    fi

RUN npm run build

# Set ownership for app and data directories
RUN chown -R azaz:azaz /app /data

# Switch to non-root user
USER azaz

EXPOSE 3000 3001 3002

CMD ["npm", "start"]
