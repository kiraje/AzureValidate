#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
#  Azure Service Principal Validator — Install Script
# ─────────────────────────────────────────────────────────

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

info()    { echo -e "${CYAN}▸ $*${RESET}"; }
success() { echo -e "${GREEN}✓ $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠ $*${RESET}"; }
error()   { echo -e "${RED}✗ $*${RESET}"; exit 1; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

# ── 1. Prerequisites ───────────────────────────────────────

header "Checking prerequisites…"

command -v docker &>/dev/null || error "Docker is not installed. Install Docker Desktop from https://docker.com and try again."
docker info &>/dev/null       || error "Docker daemon is not running. Start Docker Desktop and try again."

# Support both 'docker compose' (v2 plugin) and 'docker-compose' (v1)
if docker compose version &>/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE="docker-compose"
else
  error "'docker compose' plugin not found. Update Docker Desktop or install the compose plugin."
fi

success "Docker is ready  (compose: $COMPOSE)"

# ── 2. Generate .env ───────────────────────────────────────

header "Setting up environment…"

ENV_FILE=".env"

if [[ -f "$ENV_FILE" ]]; then
  warn ".env already exists — skipping generation (delete it to regenerate)"
else
  # Generate random secrets
  API_KEY="azval-$(openssl rand -hex 16 2>/dev/null || LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 32)"
  SESSION_SECRET="$(openssl rand -hex 32 2>/dev/null || LC_ALL=C tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 64)"

  cat > "$ENV_FILE" <<EOF
# ── Database ──────────────────────────────────────────────
DATABASE_URL=postgresql://postgres:password@db:5432/validator

# ── Redis ─────────────────────────────────────────────────
REDIS_URL=redis://redis:6379

# ── App ───────────────────────────────────────────────────
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# ── Security (auto-generated) ─────────────────────────────
API_KEY=${API_KEY}
SESSION_SECRET=${SESSION_SECRET}

# ── Validation ────────────────────────────────────────────
CLEANUP_ENABLED=true
VALIDATION_TIMEOUT=300000

# ── Webhooks ──────────────────────────────────────────────
WEBHOOK_RETRY_COUNT=3
WEBHOOK_TIMEOUT=30000
EOF

  success ".env generated with random API key and session secret"
  echo -e "  ${YELLOW}API_KEY = ${API_KEY}${RESET}"
fi

# ── 3. Build image ─────────────────────────────────────────

header "Building Docker image…"
info "This takes ~5 minutes on first run (Azure CLI install). Grab a coffee ☕"

docker build -t azure-validator:latest . || error "Docker build failed."

success "Image built: azure-validator:latest"

# ── 4. Start stack ─────────────────────────────────────────

header "Starting services…"

$COMPOSE down --remove-orphans 2>/dev/null || true
$COMPOSE up -d

success "All services started"

# ── 5. Wait for health ─────────────────────────────────────

header "Waiting for app to be ready…"

MAX_WAIT=90
ELAPSED=0
INTERVAL=3

until curl -sf http://localhost:8080/api/health &>/dev/null; do
  if (( ELAPSED >= MAX_WAIT )); then
    warn "App didn't respond within ${MAX_WAIT}s. Check logs with: docker compose logs -f"
    break
  fi
  printf "  waiting… (%ds)\r" "$ELAPSED"
  sleep "$INTERVAL"
  ELAPSED=$(( ELAPSED + INTERVAL ))
done

if curl -sf http://localhost:8080/api/health &>/dev/null; then
  success "App is healthy"
fi

# ── 6. Summary ─────────────────────────────────────────────

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}${BOLD}  Azure Service Principal Validator is running!${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  ${BOLD}URL:${RESET}      http://localhost:8080"
echo -e "  ${BOLD}API key:${RESET}  $(grep '^API_KEY=' .env | cut -d= -f2)"
echo ""
echo -e "  Useful commands:"
echo -e "    ${CYAN}$COMPOSE logs -f${RESET}            — live logs (all services)"
echo -e "    ${CYAN}$COMPOSE logs -f validator-worker${RESET} — worker logs only"
echo -e "    ${CYAN}$COMPOSE ps${RESET}                 — service status"
echo -e "    ${CYAN}$COMPOSE down${RESET}               — stop everything"
echo ""
