FROM node:20-alpine

# Glossopetrae build arguments
ARG ENABLE_GLOSSOPETRAE=false
ARG GLOSSOPETRAE_VERSION=main
ARG GLOSSOPETRAE_REPO=https://github.com/plinylmao/GLOSSOPETRAE.git

# Set Vite environment variable for Glossopetrae (available at build and runtime)
ENV VITE_GLOSSOPETRAE_ENABLED=$ENABLE_GLOSSOPETRAE

# Install git if Glossopetrae is enabled
RUN if [ "$ENABLE_GLOSSOPETRAE" = "true" ]; then \
      apk add --no-cache git; \
    fi

# Create non-root user (remove existing node user with UID 1000 first)
RUN deluser node && adduser -D -u 1000 -s /bin/sh alec

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Clone Glossopetrae if enabled
RUN if [ "$ENABLE_GLOSSOPETRAE" = "true" ]; then \
      echo "Installing Glossopetrae (version: $GLOSSOPETRAE_VERSION)..."; \
      mkdir -p /app/src/lib; \
      if [ "$GLOSSOPETRAE_VERSION" = "latest" ] || [ "$GLOSSOPETRAE_VERSION" = "main" ]; then \
        git clone --depth 1 "$GLOSSOPETRAE_REPO" /tmp/glossopetrae; \
      else \
        git clone --depth 1 --branch "$GLOSSOPETRAE_VERSION" "$GLOSSOPETRAE_REPO" /tmp/glossopetrae; \
      fi; \
      cp -r /tmp/glossopetrae/src /app/src/lib/glossopetrae; \
      rm -rf /tmp/glossopetrae; \
      echo "Glossopetrae installed successfully"; \
    else \
      echo "Glossopetrae disabled - skipping installation"; \
    fi

# Set ownership for app directory
RUN chown -R alec:alec /app

# Switch to non-root user
USER alec

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
