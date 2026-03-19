# Azure Service Principal Validator

Validates Azure service principals by performing real Azure operations — resource group creation, storage accounts, blob containers, and static website hosting. Built with Next.js 15 App Router, shadcn/ui, and real-time SSE progress streaming.

---

## Quick Start

```bash
git clone https://github.com/kiraje/AzureValidate.git
cd AzureValidate
./install.sh
```

That's it. The script:
- Generates a `.env` with random secrets
- Builds the Docker image (includes Azure CLI)
- Starts the full stack
- Waits for the app to be healthy
- Prints the URL and API key

Open **http://localhost:8080**

---

## Features

- **Validate tab** — paste service principal credentials (JSON or Azure CLI format), click Validate, watch a live per-permission checklist update in real time via SSE
- **Device Auth tab** — sign in with `az login --use-device-code`, create a service principal, and jump straight to validation — no copy-pasting credentials
- **Webhooks tab** — configure a webhook URL to receive validation results; view delivery history

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 App Router, shadcn/ui, Tailwind CSS v4 |
| Real-time | SSE (Server-Sent Events) + Redis pub/sub |
| Queue | Bull (Redis-backed) |
| Database | PostgreSQL |
| Azure SDK | `@azure/identity`, `@azure/arm-resources`, `@azure/arm-storage`, `@azure/storage-blob` |
| Container | Docker multi-stage build, nginx reverse proxy |

---

## Docker Services

```
docker compose up -d
```

| Service | Role |
|---|---|
| `nginx` | Reverse proxy → localhost:8080 |
| `validator-api` | Next.js app |
| `validator-worker` | Bull worker (Azure validation jobs) |
| `db` | PostgreSQL 15 |
| `redis` | Redis 7 |

Both `validator-api` and `validator-worker` run from the same image with different start commands.

---

## Local Development

Prerequisites: Node.js 20+, PostgreSQL, Redis

```bash
npm install
cp .env.example .env   # edit with your local DB/Redis URLs
npm run dev            # Next.js on port 3000
node src/worker.js     # Bull worker (separate terminal)
```

---

## API

### Start a validation

```bash
curl -X POST http://localhost:8080/api/validate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -d '{
    "credentials": {
      "tenant_id": "...",
      "client_id": "...",
      "client_secret": "..."
    },
    "subscription_id": "..."
  }'
```

Response `202`:
```json
{ "id": "uuid", "status": "pending" }
```

### Stream live progress

```
GET /api/validate/{id}/stream
```

Server-Sent Events — each event: `{ "step": "...", "status": "running|passed|failed" }`

### Health check

```bash
curl http://localhost:8080/api/health
```

---

## Webhook Payload

When validation completes, the configured webhook receives:

```json
{
  "validation_id": "uuid",
  "timestamp": "2024-01-01T00:00:00Z",
  "status": "valid|invalid|partial",
  "credentials": {
    "tenant_id": "...",
    "client_id": "...",
    "client_secret": "..."
  },
  "permissions": {
    "resource_group_create": true,
    "storage_account_create": true,
    "blob_container_create": true,
    "blob_upload": true,
    "static_website_enable": true,
    "storage_account_delete": true
  },
  "errors": []
}
```

> Note: the webhook payload intentionally includes credentials — this is by design for integration use cases.

---

## Required Azure Permissions

The service principal under test needs:

- `Microsoft.Resources/subscriptions/resourceGroups/write`
- `Microsoft.Storage/storageAccounts/write`
- `Microsoft.Storage/storageAccounts/blobServices/containers/write`
- `Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write`
- `Microsoft.Storage/storageAccounts/delete`

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | — | Redis connection string |
| `API_KEY` | — | API authentication key |
| `SESSION_SECRET` | — | 32+ char secret for iron-session |
| `CLEANUP_ENABLED` | `true` | Delete Azure resources after validation |
| `VALIDATION_TIMEOUT` | `300000` | Max validation time (ms) |
| `WEBHOOK_RETRY_COUNT` | `3` | Webhook delivery retries |
| `WEBHOOK_TIMEOUT` | `30000` | Webhook request timeout (ms) |

---

## License

MIT
