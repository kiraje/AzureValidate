# Azure Service Principal Validator - Docker Deployment Guide

This guide explains how to build, deploy, and use the Azure Service Principal Validator Docker image.

## Quick Start

### Using Pre-built Image from Docker Hub

```bash
# Pull the image
docker pull kiraje/azure-service-principal-validator:latest

# Run with docker-compose (recommended)
git clone <your-repo>
cd azure-service-principal-validator
docker-compose up -d
```

### Building from Source

```bash
# Clone repository
git clone <your-repo>
cd azure-service-principal-validator

# Build the image
docker build -t azure-service-principal-validator:latest .

# Run with docker-compose
docker-compose up -d
```

## Docker Hub Deployment

### Prerequisites

1. Docker Hub account: https://hub.docker.com/
2. Docker installed and running
3. Git repository with your code

### Step 1: Build the Image

```bash
# Build the image
docker build -t azure-service-principal-validator:latest .

# Tag for Docker Hub 
docker tag azure-service-principal-validator:latest kiraje/azure-service-principal-validator:latest
```

### Step 2: Login to Docker Hub

```bash
# Login to Docker Hub
docker login

# Enter your Docker Hub username and password/token when prompted
```

### Step 3: Push to Docker Hub

```bash
# Push the image
docker push kiraje/azure-service-principal-validator:latest

# Optional: Push with version tag
docker tag azure-service-principal-validator:latest kiraje/azure-service-principal-validator:v1.0.0
docker push kiraje/azure-service-principal-validator:v1.0.0
```

### Step 4: Create GitHub Repository (Optional)

```bash
# Initialize git repository
git init
git add .
git commit -m "Initial commit: Azure Service Principal Validator"

# Create repository on GitHub and push
git remote add origin https://github.com/kiraje/azure-service-principal-validator.git
git branch -M main
git push -u origin main
```

## Usage

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:password@db:5432/validator` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `API_KEY` | API authentication key | `development-api-key` |
| `PORT` | Application port | `3000` |

### Docker Compose Configuration

The application includes a complete `docker-compose.yml` with:

- **API Service**: Node.js application with Azure CLI
- **PostgreSQL Database**: Data persistence
- **Redis**: Job queue and caching

### Ports

- **Application**: `3303:3000` (external:internal)
- **Database**: `5432:5432`
- **Redis**: `6379:6379`

### Accessing the Application

After running `docker-compose up -d`:

- **Main Validator**: http://localhost:3303/
- **Device Authentication**: http://localhost:3303/device-auth.html
- **Health Check**: http://localhost:3303/health

## Features

### Core Functionality
- ✅ **Service Principal Validation** - Test Azure credentials with real operations
- ✅ **Device Authentication** - Create service principals via `az login --use-device-code`
- ✅ **Webhook Notifications** - Send validation results to configured endpoints
- ✅ **Multi-language Support** - English and Vietnamese interfaces
- ✅ **Real Azure Operations** - Storage accounts, blob containers, file uploads
- ✅ **Background Processing** - Queue-based validation jobs

### Validation Tests
- Azure Authentication
- Resource Group Creation
- Storage Account Management
- Blob Container Operations
- File Upload Capabilities
- Static Website Configuration
- Resource Cleanup

### API Endpoints

#### Manual Validation
```bash
curl -X POST http://localhost:3303/api/validate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: development-api-key" \
  -d '{
    "credentials": {
      "tenant_id": "xxx",
      "client_id": "xxx",
      "client_secret": "xxx",
      "display_name": "xxx"
    },
    "subscription_id": "xxx",
    "webhook_url": "https://your-webhook.com/endpoint"
  }'
```

#### Device Authentication
```bash
# Start device login
curl -X POST http://localhost:3303/api/device-auth/start \
  -H "X-API-Key: development-api-key"

# Check authentication status
curl -X GET http://localhost:3303/api/device-auth/status/{sessionId} \
  -H "X-API-Key: development-api-key"

# Create service principal
curl -X POST http://localhost:3303/api/device-auth/create-sp/{sessionId} \
  -H "Content-Type: application/json" \
  -H "X-API-Key: development-api-key" \
  -d '{"name": "MyServicePrincipal", "role": "Contributor"}'
```

## Architecture

### Technology Stack
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **Queue**: Redis + Bull
- **Azure Integration**: Azure CLI, Azure SDK for JavaScript
- **Frontend**: Vanilla JavaScript, HTML/CSS
- **Containerization**: Docker, Docker Compose

### File Structure
```
azure-service-principal-validator/
├── src/
│   ├── api/                 # API endpoints
│   ├── validators/          # Azure validation logic
│   ├── webhooks/           # Webhook delivery
│   └── utils/              # Utilities and database
├── public/                 # Frontend files
├── test-files/             # Sample files for upload testing
├── docker-compose.yml      # Multi-container setup
├── Dockerfile             # Container build configuration
└── package.json           # Node.js dependencies
```

## Development

### Local Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Start services with Docker
docker-compose up -d

# View logs
docker-compose logs -f validator-api
```

### Testing

```bash
# Test manual validation
curl -X POST http://localhost:3303/api/validate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: development-api-key" \
  -d @test-payload.json

# Test device authentication
curl -X POST http://localhost:3303/api/device-auth/start \
  -H "X-API-Key: development-api-key"
```

## Security Considerations

- API key authentication required for all endpoints
- Credentials encrypted at rest in PostgreSQL
- Content Security Policy (CSP) implemented
- Rate limiting on API endpoints
- Non-root container user
- Azure CLI runs in isolated container environment

## Troubleshooting

### Common Issues

1. **Container won't start**
   ```bash
   docker-compose logs validator-api
   ```

2. **Database connection issues**
   ```bash
   docker-compose exec db psql -U postgres -d validator
   ```

3. **Azure CLI issues**
   ```bash
   docker exec -it azure-validator-api az --version
   ```

4. **Port conflicts**
   - Change port in `docker-compose.yml` from `3303:3000` to another port

### Health Checks

```bash
# Application health
curl http://localhost:3303/health

# Container health
docker inspect azure-validator-api --format='{{.State.Health.Status}}'
```

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions:
- GitHub Issues: [Create an issue](https://github.com/kiraje/azure-service-principal-validator/issues)
- Documentation: This README and inline code comments