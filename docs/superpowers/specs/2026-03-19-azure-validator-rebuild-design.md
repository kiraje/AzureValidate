# Azure Validator — Full Rebuild Design Spec

**Date:** 2026-03-19
**Status:** Approved
**Scope:** Replace Express frontend + API layer with Next.js. Preserve Azure SDK validation logic. Rebuild UI from scratch.

---

## Overview

Replace the existing Express + vanilla JS app with a Next.js full-stack application. The Azure validation logic (`azureValidator.js`) is preserved unchanged except for a small progress-event addition. Bull + Redis + PostgreSQL are retained for reliability. The new frontend uses shadcn/ui with a zinc/dark theme and a pill-switcher single-page layout.

**Primary user:** Internal developer tool (single team, trusted users).

---

## Architecture

### Stack

| Layer | Current | New |
|-------|---------|-----|
| Server | Express | Next.js 15 (App Router) |
| Frontend | Vanilla JS / HTML | React + shadcn/ui + Tailwind (zinc dark) |
| Queue | Bull + Redis | Bull + Redis (unchanged) |
| Database | PostgreSQL via `pg` | PostgreSQL via `pg` (unchanged) |
| Azure SDK | `azureValidator.js` | Same file, minor addition |
| Font | System stack | Geist Sans + Geist Mono |

### Request Flow — Validation

1. User submits form → `POST /api/validate` (Next.js Route Handler)
2. Route handler validates input with Joi, inserts DB record, enqueues Bull job → returns `{ validation_id }`
3. Client opens `GET /api/validate/[id]/stream` (SSE)
4. Bull worker runs `azureValidator.js`; after each operation it publishes a progress event to Redis pub/sub channel `validation:progress:<id>`
5. SSE endpoint subscribes to that channel, forwards `{ step, status }` events to the browser
6. Browser updates permission checklist in real time
7. On completion, SSE stream closes; client fetches `/api/validate/[id]/report` for the full result
8. If webhook is enabled, worker reads `webhook_config` and enqueues a webhook delivery job

### Request Flow — Device Auth

Unchanged from current logic. Next.js Route Handlers replace Express routes 1:1.

### Progress Events Addition to `azureValidator.js`

The validator accepts an optional `onProgress(step, status)` callback. The Bull worker passes a callback that publishes to Redis pub/sub. When no callback is provided (e.g. in tests), the validator behaves exactly as before.

```js
// signature addition only — all Azure logic unchanged
async function validateServicePrincipal(credentials, subscriptionId, options = {}) {
  const { onProgress = () => {} } = options;
  // ... existing logic, with onProgress('resource_group_create', 'running') calls inserted
}
```

---

## Routes

```
GET  /                              Main app shell (pill switcher)
POST /api/validate                  Start validation job
GET  /api/validate/[id]/stream      SSE live progress stream
GET  /api/validate/[id]/status      Poll fallback (same response shape as current)
GET  /api/validate/[id]/report      Full result report
POST /api/device-auth/start         Start device code flow
GET  /api/device-auth/status/[id]   Poll device auth status
POST /api/device-auth/create-sp/[id] Create service principal
POST /api/device-auth/validate/[id] Queue validation for new SP
GET  /api/webhooks/config           Get persisted webhook config
PUT  /api/webhooks/config           Save webhook config
POST /api/webhooks/test             Send a test delivery
GET  /health                        Health check (DB + Redis)
```

---

## Data Model

### Existing tables (unchanged)
- `validations` — validation records with JSONB report field
- `webhook_deliveries` — delivery tracking with retry attempts

### New table
```sql
CREATE TABLE webhook_config (
  id            SERIAL PRIMARY KEY,
  url           TEXT,
  enabled       BOOLEAN NOT NULL DEFAULT false,
  secret_header TEXT,           -- optional Authorization header value
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Single-row table. INSERT one seed row on first boot.
```

---

## UI — Component Structure

```
app/
  layout.tsx              Root layout: Geist font, dark background, auth middleware
  page.tsx                App shell: header + pill switcher + active tab
  components/
    PillSwitcher.tsx       Segmented control (Validate | Device Auth | Webhooks)
    ValidateTab.tsx        Form + live results
    DeviceAuthTab.tsx      3-step wizard
    WebhooksTab.tsx        Config form + delivery history
    PermissionChecklist.tsx  Live-updating list of 6 permission rows
    CredentialInput.tsx    JSON textarea with inline parse error
    ValidationResult.tsx   Final passed/failed banner
```

### ValidateTab

- **Form fields:** Service Principal JSON (textarea, monospace), Subscription ID
- **Validation:** JSON parsed client-side; missing field errors shown inline (no `alert()`)
- **Submit:** Calls `/api/validate`, opens SSE stream on returned `validation_id`
- **Live checklist:** 6 rows — each transitions `pending → running → passed/failed` as SSE events arrive
- **Score counter:** `n / 6` in header, amber while running, green/red on completion
- **Cancel button:** Visible during run. Closes SSE stream; does not cancel the server-side job (it runs to completion for cleanup purposes)
- **Start Over:** Resets form and result state

### DeviceAuthTab

Three steps with a step-bubble indicator:

1. **Step 1 — Sign in:** POST `/api/device-auth/start`, show device code in large monospace + verification URL. Copy and Open URL buttons. Poll `/api/device-auth/status/[id]` every 3s. Auto-advance on `completed`.
2. **Step 2 — Create SP:** Name input (default `AzureValidatorSP`), role dropdown (Contributor / Owner / Reader). Back button. Submit calls `/api/device-auth/create-sp/[id]`.
3. **Step 3 — Credentials:** Display SP details in a read-only field list. Copy JSON button. "Validate & Test" button queues validation and switches pill to Validate tab with the new `validation_id` already streaming.

### WebhooksTab

- **Toggle:** Enable / disable webhook globally
- **Endpoint URL:** Text input, saved to `webhook_config`
- **Secret header:** Password input (optional), sent as `Authorization` header on delivery
- **Save button:** PUT `/api/webhooks/config`
- **Test button:** POST `/api/webhooks/test` — sends a mock payload, shows inline result
- **Recent deliveries:** Last 10 deliveries from `webhook_deliveries` — dot indicator (green/red), truncated validation ID, timestamp, HTTP status

---

## Authentication

The API key remains an environment variable (`API_KEY`). The browser never sends it directly.

- **Middleware (`middleware.ts`):** Checks for a signed `httpOnly` session cookie on all routes except `/api/health` and `/login`
- **Login page (`/login`):** Single field — enter the API key. On match, server sets the session cookie (7-day expiry). Redirect to `/`
- **Session cookie:** `httpOnly`, `sameSite: strict`, signed with `SESSION_SECRET` env var

New env vars required:
```
SESSION_SECRET=<random 32-byte hex>
```

---

## Real-time Progress — SSE Details

**Endpoint:** `GET /api/validate/[id]/stream`

- Subscribes to Redis pub/sub channel `validation:progress:<id>`
- Streams `data: <json>\n\n` events to the client
- Closes stream when it receives a `{ step: 'done', status: 'complete' | 'failed' }` event or after 6 minutes (safety timeout)
- Falls back gracefully: if Redis pub/sub is unavailable, the SSE endpoint polls the DB every 2s (same behaviour as current app)

**Event shape:**
```json
{ "step": "resource_group_create", "status": "running" | "passed" | "failed" }
{ "step": "done", "status": "complete" | "failed" }
```

**Steps emitted (in order):**
1. `resource_group_create`
2. `storage_account_create`
3. `blob_container_create`
4. `blob_upload`
5. `static_website_enable`
6. `storage_account_delete`

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Invalid JSON in SP field | Inline error below textarea, no submit |
| Missing required fields | Inline error listing missing fields |
| 401 from API | Redirect to `/login` (session expired) |
| SSE stream drops | Client reconnects once with `EventSource` built-in retry |
| Validation timeout (5 min) | SSE sends `{ step: 'done', status: 'failed' }` with timeout message |
| Webhook delivery fails | Retried 3×, logged in `webhook_deliveries`, shown in Webhooks tab |
| Device auth timeout (15 min) | Polling stops, inline error with restart option |

---

## What Is NOT Changing

- `src/validators/azureValidator.js` — core logic untouched (callback param added, all Azure operations identical)
- `src/utils/queue.js` — Bull queue configuration unchanged
- `src/utils/database.js` — PostgreSQL pool and existing queries unchanged
- `src/webhooks/webhookSender.js` — delivery logic unchanged
- `docker-compose.yml` — service definitions unchanged
- `test-files/` — static files for blob upload tests unchanged

---

## File Structure (new)

```
/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── login/page.tsx
│   ├── api/
│   │   ├── validate/route.ts
│   │   ├── validate/[id]/stream/route.ts
│   │   ├── validate/[id]/status/route.ts
│   │   ├── validate/[id]/report/route.ts
│   │   ├── device-auth/start/route.ts
│   │   ├── device-auth/[id]/status/route.ts
│   │   ├── device-auth/[id]/create-sp/route.ts
│   │   ├── device-auth/[id]/validate/route.ts
│   │   ├── webhooks/config/route.ts
│   │   ├── webhooks/test/route.ts
│   │   └── health/route.ts
│   └── components/
│       ├── PillSwitcher.tsx
│       ├── ValidateTab.tsx
│       ├── DeviceAuthTab.tsx
│       ├── WebhooksTab.tsx
│       ├── PermissionChecklist.tsx
│       ├── CredentialInput.tsx
│       └── ValidationResult.tsx
├── src/                          (existing backend logic — unchanged)
│   ├── validators/azureValidator.js
│   ├── utils/queue.js
│   ├── utils/database.js
│   ├── utils/logger.js
│   └── webhooks/webhookSender.js
├── middleware.ts                  (session cookie auth)
├── components.json                (shadcn config)
├── tailwind.config.ts
└── next.config.ts
```

---

## Dependencies to Add

```json
{
  "next": "^15",
  "react": "^19",
  "react-dom": "^19",
  "geist": "latest",
  "tailwindcss": "^4",
  "@tailwindcss/postcss": "^4",
  "iron-session": "^8"
}
```

shadcn/ui components: `button`, `input`, `textarea`, `badge`, `separator`, `switch`, `tooltip`

---

## Out of Scope

- Multi-user auth / roles
- Azure region selection in UI (eastus hardcoded, configurable via env var)
- Test suite (existing gap, not addressed in this rebuild)
- Pagination for delivery history (last 10 only)
