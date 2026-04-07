# Azure Validator — Full Rebuild Design Spec

**Date:** 2026-03-19
**Status:** Approved
**Scope:** Replace Express frontend + API layer with Next.js. Preserve Azure SDK validation logic. Rebuild UI from scratch.

---

## Overview

Replace the existing Express + vanilla JS app with a Next.js full-stack application. The Azure validation logic (`azureValidator.js`) is preserved with a small, backwards-compatible addition. Bull + Redis + PostgreSQL are retained for reliability. The new frontend uses shadcn/ui with a zinc/dark theme and a pill-switcher single-page layout.

**Primary user:** Internal developer tool (single team, trusted users).

---

## Architecture

### Stack

| Layer | Current | New |
|-------|---------|-----|
| Server | Express | Next.js 15 (App Router) + custom `server.js` |
| Worker | Inline in `server.js` | Separate `worker.js` process (docker-compose service) |
| Frontend | Vanilla JS / HTML | React + shadcn/ui + Tailwind v4 (zinc dark) |
| Queue | Bull + Redis | Bull + Redis (unchanged) |
| Database | PostgreSQL via `pg` | PostgreSQL via `pg` (unchanged) |
| Azure SDK | `azureValidator.js` | Same file, optional 4th arg added |
| Font | System stack | Geist Sans + Geist Mono |

### Worker Process Strategy

Because Next.js Route Handlers are stateless and cannot host a persistent Bull worker, the app runs two processes in Docker:

```yaml
# docker-compose.yml additions
validator-app:
  command: node server.js          # custom Next.js server (no queue)

validator-worker:
  command: node src/worker.js      # Bull worker process only
```

`src/worker.js` is a new thin file:
```js
require('dotenv').config();
const { initializeQueue } = require('./utils/queue');
const { initializeDatabase } = require('./utils/database');
const logger = require('./utils/logger');

async function start() {
  await initializeDatabase();
  initializeQueue();
  logger.info('Worker started');
}
start();
```

`database.js` is unchanged except for the `webhook_config` additions described in the Data Model section. `queue.js` has two targeted changes described below: replacing the per-validation webhook URL read with a global config read, and adding the `onProgress` publish call. All other queue logic is unchanged.

### Custom Next.js Server (`server.js`)

Replaces the Express `server.js`. Boots Next.js only — no queue initialization:

```js
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res, parse(req.url, true)))
    .listen(process.env.PORT || 3000);
});
```

### Request Flow — Validation

1. User submits form → `POST /api/validate` (Next.js Route Handler)
2. Route Handler validates input with Joi, inserts DB record, enqueues Bull job → returns `{ validation_id }`
3. Client opens `GET /api/validate/[id]/stream` (SSE)
4. Bull worker (separate process) runs `azureValidator.js`; after each operation it publishes a progress event to Redis pub/sub channel `validation:progress:<id>`
5. SSE endpoint subscribes to that channel, forwards `{ step, status }` events to the browser
6. Browser updates permission checklist in real time
7. On completion, SSE stream closes; client fetches `GET /api/validate/[id]/report` for the full result
8. Worker reads `webhook_config` table; if enabled, enqueues a webhook delivery job

### Request Flow — Device Auth

Unchanged from current logic. Next.js Route Handlers replace Express routes 1:1.

---

## Routes

All device-auth routes use the `[id]` segment before the action name, matching the Next.js file-system layout.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Main app shell |
| `GET` | `/login` | Login page |
| `POST` | `/api/validate` | Start validation job |
| `GET` | `/api/validate/[id]/stream` | SSE live progress |
| `GET` | `/api/validate/[id]/status` | Poll fallback |
| `GET` | `/api/validate/[id]/report` | Full result |
| `POST` | `/api/device-auth/start` | Start device code flow |
| `GET` | `/api/device-auth/[id]/status` | Poll device auth status |
| `POST` | `/api/device-auth/[id]/create-sp` | Create service principal |
| `POST` | `/api/device-auth/[id]/validate` | Queue validation for new SP |
| `GET` | `/api/webhooks/config` | Get persisted webhook config |
| `PUT` | `/api/webhooks/config` | Save webhook config |
| `POST` | `/api/webhooks/test` | Send test delivery |
| `GET` | `/api/webhooks/deliveries` | Last 10 delivery records |
| `POST` | `/api/login` | Authenticate and set session cookie |
| `GET` | `/api/health` | Health check |

### Request / Response Shapes

**`POST /api/validate`**
```ts
// Request body
{
  credentials: {
    tenant_id: string,
    client_id: string,
    client_secret: string,
    display_name?: string
  },
  subscription_id: string
  // webhook_url is no longer accepted here; configured globally in webhook_config
}

// 202 Response
{ validation_id: string, status: "pending" }

// 400 Response
{ error: string }
```

**`GET /api/validate/[id]/stream`**
- `200` with `Content-Type: text/event-stream`
- Unnamed events (`onmessage` on client); each event is `data: <json>\n\n`
- Event payload: `{ step: string, status: "running" | "passed" | "failed" }`
- Terminal event: `{ step: "done", status: "complete" | "failed", errors?: string[] }`
- Stream closes after terminal event or after 6-minute safety timeout
- `404` if `validation_id` not found in DB

**SSE Redis subscriber lifecycle:**
Each incoming request to this endpoint creates a **new dedicated `ioredis` client** in subscriber mode (subscriber connections cannot be shared or used for other commands). The lifecycle:
```js
// In the Route Handler
const sub = new Redis(process.env.REDIS_URL);
await sub.subscribe(`validation:progress:${id}`);

// On stream close (request abort, timeout, or terminal event):
await sub.unsubscribe();
sub.disconnect();
```
The Route Handler uses a `ReadableStream` (Web Streams API, compatible with Next.js App Router) and cleans up in the `cancel()` callback. This means one Redis connection per active SSE client — acceptable for a low-traffic internal tool.

**Fallback:** If Redis pub/sub is unavailable (connection error on subscribe), the SSE endpoint falls back to polling the DB every 2s for `status = valid | invalid | failed`, then delivers a single terminal event. No per-step progress in fallback mode.

**`GET /api/validate/[id]/status`**
```ts
// 200 Response (same shape as current app)
{ validation_id: string, status: "pending" | "in_progress" | "valid" | "invalid" | "failed", started_at: string, completed_at: string | null }
// 404 if not found
{ error: "Validation not found" }
```

**`GET /api/validate/[id]/report`**
```ts
// 200 Response
{
  validation_id: string,
  status: "valid" | "invalid" | "failed",
  started_at: string,
  completed_at: string,
  report: {
    isValid: boolean,
    permissions: {
      resource_group_create: boolean,
      storage_account_create: boolean,
      static_website_enable: boolean,
      blob_container_create: boolean,
      blob_upload: boolean,
      storage_account_delete: boolean
    },
    errors: string[],
    storageAccountName: string | null,
    websiteUrl: string | null
  }
}
// 404 if not found
{ error: "Validation not found" }
// 202 if job not yet complete
{ error: "Validation still in progress" }
```

**`GET /api/webhooks/config`**
```ts
// 200 Response (secret_header is masked)
{ url: string | null, enabled: boolean, has_secret: boolean, updated_at: string }
// has_secret = true when secret_header is set; value never returned to client
```

**`PUT /api/webhooks/config`**
```ts
// Request body
{ url: string | null, enabled: boolean, secret_header?: string | null }
// 200 Response — same shape as GET
```

**`POST /api/webhooks/test`**
```ts
// No request body; reads config from webhook_config table
// Sends a mock payload to the configured URL
// 200 Response
{ status: number, ok: boolean, message: string }
// 400 if webhook is not configured or not enabled
{ error: "No webhook configured" }
```

**`GET /api/webhooks/deliveries`**
```ts
// 200 Response
{
  deliveries: Array<{
    id: string,
    validation_id: string,
    http_status: number | null,
    success: boolean,
    attempted_at: string
  }>
}
// Returns last 10 rows ordered by attempted_at DESC
```

**`POST /api/login`**
```ts
// Request body
{ apiKey: string }
// 200 Response — sets az-validator-session cookie
{}
// 401 Response
{ error: "Invalid API key" }
```

---

## Data Model

### Existing tables (unchanged)
- `validations` — validation records; `webhook_url` column is kept but ignored by the worker (superseded by `webhook_config`)
- `webhook_deliveries` — delivery tracking with retry attempts

### `queue.js` — one change only
The worker currently reads `validation.webhook_url` to decide whether to fire a webhook. This is replaced with a read from `webhook_config`:

```js
// Old (removed)
if (validation.webhook_url) { ... }

// New
const config = await getWebhookConfig();   // new db.js helper
if (config.enabled && config.url) { ... }
```

### New table: `webhook_config`
```sql
CREATE TABLE IF NOT EXISTS webhook_config (
  id            INTEGER PRIMARY KEY DEFAULT 1,   -- enforces single row
  url           TEXT,
  enabled       BOOLEAN NOT NULL DEFAULT false,
  secret_header TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Seed on first boot (idempotent):
INSERT INTO webhook_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
```

This seeding runs inside `database.js` `initializeDatabase()` alongside the existing `CREATE TABLE IF NOT EXISTS` statements — same pattern already used. Upserts on the config row use `UPDATE webhook_config SET ... WHERE id = 1`.

A new helper is added to `database.js`:
```js
async function getWebhookConfig() { /* SELECT * FROM webhook_config WHERE id = 1 */ }
async function saveWebhookConfig({ url, enabled, secret_header }) { /* UPDATE ... WHERE id = 1 */ }
```

---

## `azureValidator.js` Change (Backwards-Compatible)

The only change is an optional 4th argument. The existing 3rd argument (`testConfig`) is unchanged:

```js
// Old signature (still works — queue.js calls this)
async function validateServicePrincipal(credentials, subscriptionId, testConfig)

// New signature
async function validateServicePrincipal(credentials, subscriptionId, testConfig, onProgress = () => {})
```

`queue.js` does **not** need to change its call site for the existing 3 args. When the worker wants live progress, it passes the callback as the 4th arg:

In `queue.js`, add a dedicated `ioredis` publisher client (separate from the Bull connection, since pub/sub dedicates a connection):

```js
// At the top of queue.js, alongside existing Bull Queue declarations
const Redis = require('ioredis');
const pubRedis = new Redis(process.env.REDIS_URL);
```

Then in the validation job handler, pass the callback as the 4th arg. The validation ID is available as `job.data.validationId` (the existing field already stored in job data):

```js
// In the queue.js validation job processor
const { validationId, credentials, subscriptionId, testConfig } = job.data;

const result = await validateServicePrincipal(
  credentials, subscriptionId, testConfig,
  (step, status) => pubRedis.publish(
    `validation:progress:${validationId}`,
    JSON.stringify({ step, status })
  )
);
```

Progress events are published inside `azureValidator.js` after each operation:
```js
onProgress('resource_group_create', 'running');
// ... azure operation ...
onProgress('resource_group_create', result ? 'passed' : 'failed');
```

---

## SSE Step Order

Steps are emitted in the actual execution order of `azureValidator.js`:

1. `resource_group_create`
2. `storage_account_create`
3. `static_website_enable`
4. `blob_container_create`
5. `blob_upload`
6. `storage_account_delete`

The `PermissionChecklist` component renders rows in this order.

---

## UI — Component Structure

```
app/
  layout.tsx              Root layout: Geist font, dark background
  page.tsx                App shell: header + pill switcher + active tab
  login/page.tsx          Login: single API key field, sets session cookie
  api/                    Route Handlers (see routes table above)
  components/
    PillSwitcher.tsx       Segmented control (Validate | Device Auth | Webhooks)
    ValidateTab.tsx        Form + live results
    DeviceAuthTab.tsx      3-step wizard
    WebhooksTab.tsx        Config form + delivery history
    PermissionChecklist.tsx  Live-updating list of 6 permission rows
    CredentialInput.tsx    JSON textarea with inline parse error
    ValidationResult.tsx   Final passed/failed banner
middleware.ts              Session cookie auth guard
```

### ValidateTab

- **Form fields:** Service Principal JSON (textarea, monospace), Subscription ID
- **Validation:** JSON parsed client-side; missing field errors shown inline below field (no `alert()`)
- **Submit:** Calls `POST /api/validate`, opens `EventSource` on `/api/validate/[id]/stream`
- **Live checklist:** 6 rows — each transitions `pending → running → passed/failed` via `onmessage` events
- **Score counter:** `n / 6` in header, amber while running, green/red on completion
- **Cancel button:** Visible during run. Closes `EventSource`; server-side job continues to completion for cleanup
- **Start Over:** Resets form and result state; removes `validation_id` from component state

### DeviceAuthTab

Three steps with a step-bubble indicator:

1. **Step 1 — Sign in:** `POST /api/device-auth/start`, show device code in large monospace + verification URL. Copy and Open URL buttons. Poll `GET /api/device-auth/[id]/status` every 3s. Auto-advance on `completed`.
2. **Step 2 — Create SP:** Name input (default `AzureValidatorSP`), role dropdown (Contributor / Owner / Reader). Back button. Submit calls `POST /api/device-auth/[id]/create-sp`.
3. **Step 3 — Credentials:** Display SP fields read-only. Copy JSON button. "Validate & Test" calls `POST /api/device-auth/[id]/validate` with no body (webhook URL is read from `webhook_config` server-side, same as regular validation). Switches pill to Validate tab, opens SSE stream for the returned `validation_id`.

**`POST /api/device-auth/[id]/validate` request/response:**
```ts
// Request body — empty ({}) — no webhook_url field
{}

// 202 Response
{ validation_id: string, status: "pending" }
```

### WebhooksTab

- **Toggle:** Enable / disable webhook globally (updates DB on change)
- **Endpoint URL:** Text input
- **Secret header:** Password input (optional); when loaded from config, field shows placeholder `••••••••` if `has_secret: true`
- **Save button:** `PUT /api/webhooks/config`
- **Test button:** `POST /api/webhooks/test` — shows inline HTTP status result
- **Recent deliveries:** Last 10 rows from `webhook_deliveries` — green/red dot, truncated validation ID, HTTP status, timestamp

---

## Authentication

The API key remains an environment variable (`API_KEY`). The browser never sends it directly.

- **Cookie name:** `az-validator-session`
- **Implementation:** `iron-session` v8. Cookie is `httpOnly`, `sameSite: strict`, `secure` in production
- **`SESSION_SECRET`:** Must be at least 32 characters. Used directly as `iron-session` `password` option
- **Expiry:** 7 days (`maxAge: 60 * 60 * 24 * 7`)
- **`middleware.ts`:** Checks for the `az-validator-session` cookie on all routes. If absent or invalid, redirects to `/login`. Excludes: `/login`, `/api/login`, `/api/health`. Middleware runs on the Edge runtime and only checks cookie presence — it does **not** call `iron-session` (Edge-incompatible). Route Handlers that need the session call `getIronSession()` directly.
- **Session data shape:**
```ts
interface SessionData {
  authenticated: boolean;
}
```
- **Shared session config** (used by both the login route and any Route Handler that reads the session):
```ts
// lib/session.ts
export const sessionOptions = {
  cookieName: 'az-validator-session',
  password: process.env.SESSION_SECRET!,
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
  },
};
```
- **Login Route Handler** (`app/api/login/route.ts` — also add `POST /api/login` to routes table):
```ts
// POST /api/login
const { apiKey } = await request.json();
if (apiKey !== process.env.API_KEY) return Response.json({ error: 'Invalid API key' }, { status: 401 });
const res = new Response(null, { status: 200 });
const session = await getIronSession<SessionData>(request, res, sessionOptions);
session.authenticated = true;
await session.save();
return res;
```
- **Login page** (`app/login/page.tsx`): client component that POSTs to `/api/login`, redirects to `/` on success.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Invalid JSON in SP field | Inline error below textarea; submit button disabled |
| Missing required SP fields | Inline error listing field names |
| `POST /api/validate` 400 | Inline error in ValidateTab |
| `POST /api/validate` 401 | Middleware redirects to `/login` (cookie expired) |
| Unknown `validation_id` in stream/status/report | 404 JSON `{ error: "Validation not found" }` |
| Report requested before job complete | 202 JSON `{ error: "Validation still in progress" }` |
| SSE stream drops | `EventSource` reconnects automatically (built-in browser retry) |
| Validation timeout (5 min) | Worker publishes `{ step: "done", status: "failed" }` with timeout message; SSE closes |
| SSE safety timeout (6 min) | Server closes SSE stream; client shows "Timed out waiting for result" |
| Redis unavailable (SSE fallback) | SSE delivers single terminal event only (no per-step progress) |
| Webhook delivery fails | Retried 3×; final status logged in `webhook_deliveries`, shown in Webhooks tab |
| Device auth timeout (15 min) | Polling stops; inline error with "Start Over" button |
| Test webhook: not configured | 400 `{ error: "No webhook configured" }` — shown inline |

---

## File Structure

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
│   │   ├── webhooks/deliveries/route.ts
│   │   ├── login/route.ts
│   │   └── health/route.ts
│   └── components/
│       ├── PillSwitcher.tsx
│       ├── ValidateTab.tsx
│       ├── DeviceAuthTab.tsx
│       ├── WebhooksTab.tsx
│       ├── PermissionChecklist.tsx
│       ├── CredentialInput.tsx
│       └── ValidationResult.tsx
├── src/                          (existing — minimal changes noted above)
│   ├── validators/azureValidator.js   (+4th arg onProgress)
│   ├── utils/queue.js                 (+webhook_config read, +onProgress call)
│   ├── utils/database.js             (+webhook_config table, +2 helpers)
│   ├── utils/logger.js               (unchanged)
│   └── webhooks/webhookSender.js     (unchanged)
├── src/worker.js                  (new — thin Bull worker entrypoint)
├── server.js                      (new — custom Next.js server, no queue)
├── lib/
│   └── session.ts                 (new — shared iron-session config)
├── middleware.ts                  (new — session cookie presence check)
├── components.json                (shadcn config)
├── app/globals.css                (Tailwind v4 CSS-first config via @import + @theme)
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
  "iron-session": "^8",
  "ioredis": "^5"
}
```

Note: `ioredis` must be an explicit direct dependency since Route Handlers and `queue.js` both import it directly (not via Bull's internal bundling).

**shadcn/ui setup:** Use `npx shadcn@latest init` with the `--css-variables` flag (required for Tailwind v4 compatibility). Components needed: `button`, `input`, `textarea`, `badge`, `separator`, `switch`, `tooltip`.

**Tailwind v4 note:** No `tailwind.config.ts` file. Configuration is CSS-first via `@theme` in a global CSS file. The shadcn `init` command handles this automatically when run against a Next.js + Tailwind v4 project.

---

## Environment Variables

### Existing (unchanged)
```env
DATABASE_URL, REDIS_URL, PORT, API_KEY, NODE_ENV,
WEBHOOK_RETRY_COUNT, WEBHOOK_TIMEOUT, VALIDATION_TIMEOUT,
CLEANUP_ENABLED, LOG_LEVEL
```

### New
```env
SESSION_SECRET=<random string, minimum 32 characters>
```

---

## What Is NOT Changing

- Core Azure operations in `azureValidator.js` (all 6 tests, retry logic, cleanup)
- `webhookSender.js` — delivery logic unchanged
- `docker-compose.yml` services for PostgreSQL and Redis (validator-app and validator-worker services updated)
- `test-files/` — static files for blob upload tests
- All existing DB table schemas except the addition of `webhook_config`

---

## Out of Scope

- Multi-user auth / roles
- Azure region selection in UI (`eastus` hardcoded; overridable via env var)
- Test suite
- Pagination for delivery history (last 10 only)
