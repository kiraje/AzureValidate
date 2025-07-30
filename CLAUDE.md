# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Azure Service Principal Validator - Project Context

## Project Overview
This project creates a web application that validates Azure service principals by performing real-world operations to verify they have the necessary permissions. The validator mimics the operations from az.py to ensure credentials can perform essential Azure tasks.

## Key Requirements

### Core Functionality
1. **Validate Azure Service Principals** by performing actual Azure operations
2. **API endpoints** for integration with other applications
3. **Webhook notifications** that include credential validation status
4. **Test with sample files/folders** to verify blob storage permissions

### Validation Operations (from az.py)
- Create resource groups
- Create storage accounts with retry logic
- Enable static website hosting
- Create and configure blob containers
- Upload files with proper content types
- Manage storage account lifecycle (cleanup old accounts)

## Technical Decisions

### Framework Choice
- **Node.js with Express** for JavaScript developers
- **Python with FastAPI** for Python developers
- Both options support async operations needed for Azure SDK

### Security Requirements
- Credentials must be encrypted at rest
- Webhook payloads include credentials (as requested)
- API authentication required
- Rate limiting for protection

### Webhook Specification
The webhook must return validation results with:
- Overall valid/invalid status
- Individual permission checks
- The credentials that were tested
- Any errors encountered
- Created resources (storage account name, website URL)

## Implementation Guidelines

### Code Structure
```
project/
├── src/
│   ├── api/          # API endpoints
│   ├── validators/   # Azure validation logic
│   ├── webhooks/     # Webhook delivery
│   ├── utils/        # Helper functions
│   └── config/       # Configuration
├── test-files/       # Sample files for upload testing
├── tests/           # Unit and integration tests
└── docs/            # API documentation
```

### Validation Flow
1. Receive credentials via API
2. Queue validation job
3. Execute each Azure operation
4. Track success/failure
5. Clean up resources
6. Send webhook with results

### Error Handling
- Graceful handling of Azure API failures
- Timeout management (60s per operation)
- Detailed error messages for debugging
- Cleanup even on failure

## Development Commands

### Setup
```bash
# Node.js
npm install
npm run dev

# Python
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

### Testing
```bash
# Run validation tests
npm test           # Node.js
pytest            # Python

# Test with curl
curl -X POST http://localhost:3000/api/validate \
  -H "Content-Type: application/json" \
  -d '{
    "credentials": {
      "tenant_id": "xxx",
      "client_id": "xxx", 
      "client_secret": "xxx"
    },
    "subscription_id": "xxx",
    "webhook_url": "https://example.com/webhook"
  }'
```

## Important Notes

### Resource Cleanup
- Always delete created resources after validation
- Keep only 2 newest storage accounts (like az.py)
- Tag resources for easy identification

### Timeout Handling
- 60 second timeout for storage account creation
- 5 minute overall validation timeout
- Implement retries for transient failures

### Logging
- Log all Azure operations
- Never log credentials
- Include request IDs for debugging
- Store logs for audit trail

## Common Issues

### Permission Errors
If validation fails, check service principal has:
- Contributor role on subscription/resource group
- Storage Account Contributor
- Storage Blob Data Contributor

### Network Issues
- Azure operations may fail due to network
- Implement exponential backoff
- Provide clear timeout errors

### Cost Management
- Delete resources after validation
- Monitor for orphaned resources
- Set spending alerts

## Quick Reference

### Required Azure Permissions
```
Microsoft.Resources/subscriptions/resourceGroups/write
Microsoft.Storage/storageAccounts/write
Microsoft.Storage/storageAccounts/blobServices/containers/write
Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write
Microsoft.Storage/storageAccounts/delete
```

### Environment Variables
```
AZURE_TENANT_ID
AZURE_CLIENT_ID  
AZURE_CLIENT_SECRET
AZURE_SUBSCRIPTION_ID
DATABASE_URL
WEBHOOK_RETRY_COUNT=3
VALIDATION_TIMEOUT=300000
```

### API Endpoints
- `POST /api/validate` - Start validation
- `GET /api/validation/:id/status` - Check status
- `GET /api/validation/:id/report` - Get detailed report
- `POST /api/webhook/register` - Register webhook
- `DELETE /api/webhook/:id` - Remove webhook

## Docker Deployment

### Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/yourorg/azure-validator.git
cd azure-validator

# Copy environment template
cp .env.example .env.production

# Build and run with Docker Compose
docker-compose up -d

# Check logs
docker-compose logs -f validator-api

# Stop services
docker-compose down
```

### Production Deployment

```bash
# Build production image
docker build -t azure-validator:latest .

# Tag for registry
docker tag azure-validator:latest myregistry.azurecr.io/azure-validator:latest

# Push to registry
docker push myregistry.azurecr.io/azure-validator:latest

# Deploy with production compose
docker-compose -f docker-compose.prod.yml up -d
```

### Docker Commands Reference

```bash
# View running containers
docker ps

# Check application logs
docker logs azure-validator-api

# Execute commands in container
docker exec -it azure-validator-api sh

# Clean up volumes
docker volume prune

# Remove all stopped containers
docker container prune

# Update single service
docker-compose up -d --no-deps --build validator-api
```

### Health Checks

```bash
# Check API health
curl http://localhost:3000/health

# Check with Docker
docker inspect azure-validator-api --format='{{.State.Health.Status}}'

# Monitor resources
docker stats azure-validator-api
```

### Environment Configuration

Create `.env.production` file:
```env
# Azure Credentials
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_SUBSCRIPTION_ID=your-subscription-id

# Database
DATABASE_URL=postgresql://postgres:strongpassword@db:5432/validator

# Redis
REDIS_URL=redis://redis:6379

# API Configuration
PORT=3000
API_KEY=your-api-key
NODE_ENV=production

# Webhook Settings
WEBHOOK_RETRY_COUNT=3
WEBHOOK_TIMEOUT=30000

# Validation Settings
VALIDATION_TIMEOUT=300000
CLEANUP_ENABLED=true
```

### Troubleshooting Docker

#### Container won't start
```bash
# Check logs
docker-compose logs validator-api

# Verify environment variables
docker-compose config

# Check file permissions
ls -la test-files/
```

#### Database connection issues
```bash
# Test database connection
docker exec -it azure-validator-db psql -U postgres -d validator

# Check network
docker network ls
docker network inspect azure-validator_default
```

#### Memory issues
```bash
# Check resource usage
docker stats

# Increase limits in docker-compose.yml
# Under deploy.resources.limits
```

### Monitoring

Access monitoring tools:
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin)
- Application logs: `./logs/`

### Backup and Restore

```bash
# Backup database
docker exec azure-validator-db pg_dump -U postgres validator > backup.sql

# Restore database
docker exec -i azure-validator-db psql -U postgres validator < backup.sql

# Backup volumes
docker run --rm -v azure-validator_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz -C /data .
```

### Security Notes for Docker

1. **Never commit .env files** - Use .env.example as template
2. **Use secrets management** in production (Azure Key Vault, Docker Secrets)
3. **Run containers as non-root** user when possible
4. **Keep base images updated** - Rebuild regularly
5. **Scan images for vulnerabilities** using tools like Trivy

### CI/CD Integration

The project includes GitHub Actions workflow for:
- Building Docker images on push
- Running security scans
- Pushing to Azure Container Registry
- Deploying to Azure Container Instances

Set these GitHub Secrets:
- `ACR_REGISTRY` - Your Azure Container Registry URL
- `ACR_USERNAME` - Registry username
- `ACR_PASSWORD` - Registry password
- `RESOURCE_GROUP` - Azure resource group for deployment
- `DATABASE_URL` - Production database connection string
- `REDIS_URL` - Production Redis connection string

## Key Development Commands

### Running the Application
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start

# Run with Docker
docker-compose up -d
```

### Code Quality
```bash
# Run ESLint to check code style
npm run lint

# Auto-fix ESLint issues
npm run lint:fix

# Run tests (when implemented)
npm test
```

### Testing Individual Operations
```bash
# Test a single validation (requires valid Azure credentials in .env)
node src/validators/azureValidator.js

# Test webhook delivery
curl -X POST http://localhost:3000/api/validate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: development-api-key" \
  -d @test-payload.json
```

## Architecture Overview

### Core Components

1. **API Layer** (`src/api/`)
   - `validate.js`: Main validation endpoint that queues jobs
   - `webhook.js`: Webhook registration and management
   - `health.js`: Health check endpoint

2. **Validation Engine** (`src/validators/azureValidator.js`)
   - Performs actual Azure operations (mimics az.py)
   - Tests: resource group creation, storage account management, blob operations
   - Implements retry logic and timeout handling

3. **Queue System** (`src/utils/queue.js`)
   - Uses Bull/Redis for job queuing
   - Handles async validation processing
   - Manages job retries and failures

4. **Webhook Delivery** (`src/webhooks/webhookSender.js`)
   - Sends validation results to registered webhooks
   - Implements retry logic with exponential backoff
   - Includes full credentials in payload (as requested)

### Request Flow
1. API receives validation request → Creates job in queue
2. Worker picks up job → Executes Azure operations
3. Results stored in database → Webhook notification sent
4. Client can poll status endpoint for updates

### Key Implementation Details

- **Authentication**: API key in `X-API-Key` header
- **Async Processing**: All validations run as background jobs
- **Resource Cleanup**: Deletes created resources after validation (keeps only 2 newest storage accounts like az.py)
- **Error Handling**: Detailed error tracking with cleanup on failure
- **Timeouts**: 60s per operation, 5 minute overall validation timeout

## Testing Notes

The project uses Jest for testing but test files are not yet implemented. When adding tests:
- Place unit tests in `tests/unit/`
- Place integration tests in `tests/integration/`
- Mock Azure SDK calls for unit tests
- Use test Azure credentials for integration tests

## Common Development Tasks

### Adding New Validation Checks
1. Add new permission check to `src/validators/azureValidator.js`
2. Update the permissions object in validation results
3. Add corresponding webhook payload field
4. Update API documentation

### Debugging Failed Validations
1. Check logs in `logs/` directory
2. Look for Azure SDK errors in validation logs
3. Verify service principal permissions in Azure Portal
4. Test operations manually with az.py script

### Local Development Setup
1. Install PostgreSQL and Redis locally (or use Docker)
2. Copy `.env.example` to `.env` and fill in values
3. Use development API key: `development-api-key`
4. Test with webhook.site for webhook debugging