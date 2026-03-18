# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Azure Service Principal Validator — validates Azure service principals by performing real-world Azure operations (resource group creation, storage account setup, blob operations, static website hosting). A Next.js 15 App Router web application with a 3-tab pill UI and real-time SSE progress streaming.

## Development Commands

```bash
npm run dev          # Start Next.js dev server (port 3000)
node src/worker.js   # Start Bull worker process (separate terminal)
npm run build        # Production build
npm start            # Start Next.js production server
npm test             # Run Jest tests
npm run lint         # ESLint
npm run lint:fix     # Auto-fix lint issues
```

**Prerequisites:** PostgreSQL and Redis must be running locally, or use Docker:
```bash
docker-compose up -d   # Starts nginx (8080/8443), Next.js API (internal 3000), worker, PostgreSQL, Redis
```

**Test a validation:**
```bash
curl -X POST http://localhost:3000/api/validate \
  -H "Content-Type: application/json" \
  -d '{"credentials":{"tenant_id":"xxx","client_id":"xxx","client_secret":"xxx"},"subscription_id":"xxx"}'
```

## Architecture

### UI
3-tab pill interface (Validate | Device Auth | Webhooks):
- **Validate tab** — paste SP credentials JSON + subscription ID, click Validate; live per-permission checklist via SSE
- **Device Auth tab** — 3-step wizard: device code sign-in → create SP → "Validate Now" (auto-switches to Validate tab with credentials pre-filled and validation auto-started)
- **Webhooks tab** — configure webhook URL, view recent delivery history

### Request Flow
1. `POST /api/validate` (Next.js route handler) → validates with Zod, inserts DB record, enqueues Bull job → returns 202 + validation ID
2. `GET /api/validate/[id]/stream` → SSE endpoint; subscribes to Redis pub/sub channel for that validation ID
3. Bull worker in `src/worker.js` picks up job → calls `azureValidator.js` → publishes progress events to Redis → updates DB
4. If webhook URL provided, enqueues webhook delivery job → `webhookSender.js` delivers with retry

### Key Files

**Next.js app:**
- `app/page.tsx` — root client component; tab state, pending credentials handoff from device auth
- `app/layout.tsx` — root layout
- `app/components/PillSwitcher.tsx` — tab switcher
- `app/components/ValidateTab.tsx` — credential input form + live SSE progress checklist
- `app/components/CredentialInput.tsx` — SP JSON + subscription ID form; accepts `initialCredentials`/`initialSubscriptionId` for pre-fill
- `app/components/DeviceAuthTab.tsx` — device code flow wizard; calls `onValidate` callback on completion
- `app/components/WebhooksTab.tsx` — webhook config + delivery history
- `app/components/PermissionChecklist.tsx` — animated per-permission status list
- `app/components/ValidationResult.tsx` — pass/fail result card

**API routes:**
- `app/api/validate/route.ts` — POST: start validation
- `app/api/validate/[id]/route.ts` — GET: poll validation status
- `app/api/validate/[id]/stream/route.ts` — GET: SSE stream for live progress
- `app/api/device-auth/start/route.ts` — POST: initiate device code flow
- `app/api/device-auth/[sessionId]/create-sp/route.ts` — POST: create service principal after auth
- `app/api/webhooks/route.ts` — GET/POST: list and register webhooks
- `app/api/webhooks/[id]/route.ts` — DELETE webhook
- `app/api/webhooks/[id]/deliveries/route.ts` — GET delivery history
- `app/api/health/route.ts` — GET health check

**Backend (used by worker and API routes):**
- `src/validators/azureValidator.js` — Core Azure operations: ClientSecretCredential, resource group, storage account, blob, static website
- `src/worker.js` — Bull worker process; processes validation and webhook jobs
- `src/utils/queue.js` — Two Bull queues: `validation` (5 min timeout, 3 retries) and `webhook` (30s timeout, 3 retries)
- `src/utils/database.js` — PostgreSQL via `pg` pool; `validations` and `webhook_deliveries` tables
- `src/webhooks/webhookSender.js` — POST delivery with exponential backoff; GET fallback for n8n compatibility

### Webhook Payload
The webhook payload intentionally includes the full credentials being tested (`tenant_id`, `client_id`, `client_secret`). This is by design per project requirements.

### Azure Validation Operations (in order)
1. Create resource group `azval-rg-{timestamp}`
2. Create storage account `azval{random}{timestamp}` (polls until ready, 60s timeout)
3. Enable static website hosting
4. Create blob container `$web`
5. Upload test files from `test-files/` with proper MIME types
6. Create + delete a temp storage account (tests delete permissions)
7. Clean up all created resources (if `CLEANUP_ENABLED=true`)

### Storage Account Naming
Generated as `azval` + 4 random chars + last 6 digits of timestamp. Must be globally unique in Azure, so naming avoids collisions via randomness.

### Real-time Progress (SSE + Redis pub/sub)
- Worker publishes step events to Redis channel `validation:{id}`
- SSE route handler subscribes and streams events to browser
- Each event: `{ step: string, status: 'running'|'passed'|'failed' }` or `{ step: 'done', status: 'complete'|'failed', errors: [] }`

## Environment Variables

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/validator
REDIS_URL=redis://localhost:6379
PORT=3000
NODE_ENV=development
WEBHOOK_RETRY_COUNT=3
WEBHOOK_TIMEOUT=30000
VALIDATION_TIMEOUT=300000            # 5 minutes total
CLEANUP_ENABLED=true
```

Copy `.env.example` to `.env` to get started.

## Authentication
No authentication layer on the Next.js routes (internal tool). The original Express app had an API key; that was removed in the Next.js rebuild for simplicity.

## Logging
Worker uses Pino with automatic credential redaction. Production: JSON to `logs/app.log`. Never log credentials.

## Known Gaps
- `tests/` directory exists but no tests are implemented yet
- `src/api/webhook.js` (old Express) stored webhooks in-memory — the new implementation uses the database
- Azure CLI must be installed in the container for device auth to work
