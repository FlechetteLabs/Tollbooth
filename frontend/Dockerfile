FROM node:20-alpine

# Create non-root user (remove existing node user with UID 1000 first)
RUN deluser node && adduser -D -u 1000 -s /bin/sh alec

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Set ownership for app directory
RUN chown -R alec:alec /app

# Switch to non-root user
USER alec

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
