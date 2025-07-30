# syntax=docker/dockerfile:1
# Build stage
FROM --platform=$BUILDPLATFORM node:18-alpine AS builder
ARG TARGETPLATFORM
ARG BUILDPLATFORM
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --platform=$TARGETPLATFORM

# Runtime stage  
FROM --platform=$TARGETPLATFORM node:18-alpine
ARG TARGETPLATFORM
ARG BUILDPLATFORM
RUN apk add --no-cache tini curl dumb-init python3 py3-pip gcc musl-dev linux-headers python3-dev \
    && pip3 install --break-system-packages azure-cli \
    && apk del gcc musl-dev linux-headers python3-dev
WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY src/ ./src/
COPY public/ ./public/
COPY test-files/ ./test-files/
COPY package*.json ./

# Create required directories
RUN mkdir -p logs data && \
    chmod 755 logs data

# Add non-root user and setup Azure CLI permissions
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app && \
    mkdir -p /home/nodejs/.azure && \
    chown -R nodejs:nodejs /home/nodejs/.azure

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

USER nodejs

EXPOSE 3000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/server.js"]