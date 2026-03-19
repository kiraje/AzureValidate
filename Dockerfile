# syntax=docker/dockerfile:1

# ── Stage 1: build Next.js ────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Install Azure CLI (needed for Device Auth tab) + curl for health checks
RUN apk add --no-cache curl python3 py3-pip gcc musl-dev linux-headers python3-dev \
    && pip3 install --break-system-packages azure-cli \
    && apk del gcc musl-dev linux-headers python3-dev \
    && rm -rf /root/.cache

# Copy built Next.js app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy server, worker, and backend src/
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/src ./src
COPY --from=builder /app/test-files ./test-files

RUN mkdir -p logs \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001 \
    && chown -R nodejs:nodejs /app \
    && mkdir -p /home/nodejs/.azure \
    && chown -R nodejs:nodejs /home/nodejs/.azure

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

USER nodejs
EXPOSE 3000

# Default: run the Next.js server.
# For the worker, override in docker-compose: command: node src/worker.js
CMD ["node", "server.js"]
