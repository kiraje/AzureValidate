# Azure Service Principal Validator

A comprehensive web application that validates Azure service principals by performing real Azure operations. Features Vietnamese language support, device authentication, and webhook notifications.

## 🚀 Quick Deploy with Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template/azure-validator)

### Environment Variables for Railway:
```
NODE_ENV=production
API_KEY=your-secure-api-key
DATABASE_URL=postgresql://...  # Provided by Railway PostgreSQL
REDIS_URL=redis://...          # Provided by Railway Redis
WEBHOOK_RETRY_COUNT=3
VALIDATION_TIMEOUT=300000
CLEANUP_ENABLED=true
```

## 🌟 Features

- ✅ **Real Azure Validation** - Tests actual Azure operations (storage, blobs, containers)
- ✅ **Device Authentication** - Create service principals via `az login --use-device-code`
- ✅ **Multi-language Support** - English and Vietnamese interfaces
- ✅ **Webhook Notifications** - Send validation results to configured endpoints
- ✅ **Background Processing** - Queue-based validation with PostgreSQL + Redis
- ✅ **Docker Ready** - Full containerization with multi-service setup

## Features

- Validates Azure service principal credentials
- Tests permissions by creating actual Azure resources
- Provides REST API for integration
- Sends webhook notifications with validation results
- Docker support for easy deployment

## Quick Start

### Using Docker

```bash
# Clone the repository
git clone https://github.com/yourorg/azure-service-principal-validator.git
cd azure-service-principal-validator

# Copy environment template
cp .env.example .env

# Start with Docker Compose
docker compose up -d

# Check logs
docker compose logs -f validator-api

# Check status
docker compose ps
```

### Manual Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start development server
npm run dev
```

## API Endpoints

The application exposes the following REST API endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/validate` | Start validation of Azure service principal |
| `GET` | `/api/validation/{id}/status` | Check validation status |
| `GET` | `/api/validation/{id}/report` | Get detailed validation report |
| `POST` | `/api/webhook/register` | Register webhook URL for notifications |
| `GET` | `/api/webhook/{id}` | Get webhook details |
| `DELETE` | `/api/webhook/{id}` | Delete webhook |
| `GET` | `/health` | Health check endpoint |

## API Usage Examples

### 1. Health Check

```bash
curl -s http://localhost:3000/health | jq .
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-07-25T06:46:28.025Z",
  "uptime": 216.573424058,
  "environment": "development",
  "version": "1.0.0",
  "database": "connected",
  "redis": "connected"
}
```

### 2. Start Service Principal Validation

```bash
curl -X POST http://localhost:3000/api/validate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: development-api-key" \
  -d '{
    "credentials": {
      "tenant_id": "12345678-1234-1234-1234-123456789012",
      "client_id": "87654321-4321-4321-4321-210987654321",
      "client_secret": "your-client-secret-here"
    },
    "subscription_id": "abcdef01-2345-6789-abcd-ef0123456789",
    "webhook_url": "https://webhook.site/your-unique-url",
    "test_config": {
      "resource_group": "validation-test-rg",
      "location": "eastus",
      "test_files": ["index.html", "404.html"]
    }
  }'
```

**Response:**
```json
{
  "validation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "pending",
  "message": "Validation job has been queued",
  "status_url": "/api/validation/a1b2c3d4-e5f6-7890-abcd-ef1234567890/status"
}
```

### 3. Check Validation Status

```bash
curl -X GET "http://localhost:3000/api/validation/a1b2c3d4-e5f6-7890-abcd-ef1234567890/status" \
  -H "X-API-Key: development-api-key"
```

**Response:**
```json
{
  "validation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "in_progress",
  "started_at": "2025-07-25T06:50:00.000Z",
  "completed_at": null
}
```

### 4. Get Detailed Validation Report

```bash
curl -X GET "http://localhost:3000/api/validation/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report" \
  -H "X-API-Key: development-api-key"
```

**Response:**
```json
{
  "validation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "valid",
  "started_at": "2025-07-25T06:50:00.000Z",
  "completed_at": "2025-07-25T06:52:30.000Z",
  "report": {
    "isValid": true,
    "permissions": {
      "resource_group_create": true,
      "storage_account_create": true,
      "blob_container_create": true,
      "blob_upload": true,
      "static_website_enable": true,
      "storage_account_delete": true
    },
    "errors": [],
    "storageAccountName": "azvalidatorrandom123456",
    "websiteUrl": "https://azvalidatorrandom123456.web.core.windows.net"
  }
}
```

### 5. Register Webhook

```bash
curl -X POST http://localhost:3000/api/webhook/register \
  -H "Content-Type: application/json" \
  -H "X-API-Key: development-api-key" \
  -d '{
    "url": "https://your-app.com/webhook/azure-validation",
    "events": ["validation.completed", "validation.failed"]
  }'
```

### 6. Testing with webhook.site

For quick testing, use [webhook.site](https://webhook.site/) to get a temporary webhook URL:

1. Go to https://webhook.site/
2. Copy your unique URL
3. Use it in the `webhook_url` field
4. Watch real-time webhook deliveries

### API Authentication

All API endpoints (except `/health`) require authentication using the `X-API-Key` header:

```bash
-H "X-API-Key: development-api-key"
```

For production, change the API key in your `.env` file:
```env
API_KEY=your-secure-production-api-key
```

## Webhook Payload

When validation completes, the webhook receives:

```json
{
  "validation_id": "uuid",
  "timestamp": "2024-01-01T00:00:00Z",
  "status": "valid|invalid|partial",
  "credentials": {
    "tenant_id": "xxx",
    "client_id": "xxx",
    "client_secret": "xxx",
    "valid": true
  },
  "permissions": {
    "resource_group_create": true,
    "storage_account_create": true,
    "blob_container_create": true,
    "blob_upload": true,
    "static_website_enable": true,
    "storage_account_delete": true
  },
  "errors": [],
  "storage_account_created": "name",
  "website_url": "https://xxx.web.core.windows.net"
}
```

## Required Azure Permissions

The service principal being validated needs:
- `Microsoft.Resources/subscriptions/resourceGroups/write`
- `Microsoft.Storage/storageAccounts/write`
- `Microsoft.Storage/storageAccounts/blobServices/containers/write`
- `Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write`
- `Microsoft.Storage/storageAccounts/delete`

## Configuration

See `.env.example` for all configuration options.

Key settings:
- `API_KEY`: Required for API authentication
- `CLEANUP_ENABLED`: Whether to delete created resources after validation
- `VALIDATION_TIMEOUT`: Maximum time for validation (default: 5 minutes)
- `WEBHOOK_RETRY_COUNT`: Number of webhook delivery retries

## Development

```bash
# Run tests
npm test

# Lint code
npm run lint

# Watch mode
npm run dev
```

## License

MIT