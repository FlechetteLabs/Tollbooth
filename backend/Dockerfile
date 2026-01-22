FROM node:20-slim

# Install build dependencies for native modules (needed by @xenova/transformers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create models directory for bundled ML model
RUN mkdir -p /app/models

# Set environment variable for model cache
ENV MODEL_CACHE_DIR=/app/models

COPY package*.json ./
RUN npm install

# Copy scripts (model will be downloaded lazily at runtime)
COPY scripts ./scripts

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

EXPOSE 3000 3001 3002

CMD ["npm", "start"]
