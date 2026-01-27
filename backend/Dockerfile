FROM node:20-slim

# Install build dependencies for native modules (needed by @xenova/transformers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
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

RUN npm run build

# Set ownership for app and data directories
RUN chown -R azaz:azaz /app /data

# Switch to non-root user
USER azaz

EXPOSE 3000 3001 3002

CMD ["npm", "start"]
