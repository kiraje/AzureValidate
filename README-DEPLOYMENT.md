# Azure Service Principal Validator - Docker Deployment Guide

This guide explains how to deploy the Azure Service Principal Validator with nginx reverse proxy on your homelab or VPS.

## 🚀 Quick Deployment

### Prerequisites
- Docker and Docker Compose installed
- Domain name pointing to your server (optional)
- Ports 80 and 443 available

### Deployment Steps

1. **Clone the repository:**
```bash
git clone https://github.com/kiraje/AzureValidate.git
cd AzureValidate
```

2. **Configure environment (optional):**
```bash
# Copy and edit environment file if needed
cp .env.example .env
nano .env
```

3. **Deploy with Docker Compose:**
```bash
# Start all services (nginx, app, database, redis)
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

4. **Access your application:**
- **HTTP**: http://your-server-ip
- **With domain**: http://your-domain.com
- **Health check**: http://your-server-ip/health

## 🔧 Architecture

The deployment includes:

```
Internet → Nginx (Port 80/443) → Node.js App (Internal) → PostgreSQL + Redis
```

### Services:
- **nginx**: Reverse proxy, SSL termination, rate limiting
- **validator-api**: Main Node.js application (internal port 3000)
- **db**: PostgreSQL database (internal port 5432)
- **redis**: Redis cache and job queue (internal port 6379)

## ⚙️ Configuration

### Environment Variables

Edit `.env` or set in `docker-compose.yml`:

```env
NODE_ENV=production
API_KEY=your-secure-api-key-here
DATABASE_URL=postgresql://postgres:password@db:5432/validator
REDIS_URL=redis://redis:6379
WEBHOOK_RETRY_COUNT=3
VALIDATION_TIMEOUT=300000
CLEANUP_ENABLED=true
```

### Nginx Configuration

The nginx configuration includes:
- **Rate limiting**: 30 req/s general, 10 req/s for API
- **Long timeouts**: 10 minutes for Azure validation operations
- **Static file caching**: 7 days for CSS/JS/images
- **Security headers**: XSS protection, CSRF protection
- **Gzip compression**: For text content

### Custom Domain

To use a custom domain:

1. **Point DNS** to your server IP
2. **Update nginx config** in `nginx/default.conf`:
```nginx
server_name your-domain.com;
```
3. **Restart nginx**:
```bash
docker-compose restart nginx
```

## 🔒 SSL/HTTPS Setup

### Option 1: Let's Encrypt with Certbot

1. **Install certbot in nginx container:**
```bash
# Run certbot in nginx container
docker-compose exec nginx sh
apk add certbot certbot-nginx
certbot --nginx -d your-domain.com
```

2. **Or use external certbot:**
```bash
# Install on host system
sudo apt install certbot
sudo certbot certonly --webroot -w /var/lib/letsencrypt/ -d your-domain.com

# Mount certificates in docker-compose.yml
volumes:
  - /etc/letsencrypt:/etc/letsencrypt:ro
```

### Option 2: Manual SSL Certificates

1. **Place certificates** in `nginx/ssl/` directory
2. **Uncomment HTTPS server block** in `nginx/default.conf`
3. **Update certificate paths**
4. **Restart nginx**: `docker-compose restart nginx`

## 📊 Monitoring and Logs

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f nginx
docker-compose logs -f validator-api

# Nginx access logs
docker-compose exec nginx tail -f /var/log/nginx/access.log
```

### Health Checks
```bash
# Application health
curl http://localhost/health

# Service status
docker-compose ps
```

### Performance Monitoring
```bash
# Resource usage
docker stats

# Nginx status
docker-compose exec nginx nginx -t
```

## 🔧 Troubleshooting

### Common Issues

1. **Port 80/443 already in use:**
   ```bash
   # Check what's using the ports
   sudo netstat -tulpn | grep :80
   sudo netstat -tulpn | grep :443
   
   # Stop conflicting services
   sudo systemctl stop apache2  # or nginx if installed system-wide
   ```

2. **Database connection issues:**
   ```bash
   # Check database logs
   docker-compose logs db
   
   # Connect to database
   docker-compose exec db psql -U postgres -d validator
   ```

3. **Application won't start:**
   ```bash
   # Check application logs
   docker-compose logs validator-api
   
   # Rebuild application
   docker-compose build validator-api
   docker-compose up -d
   ```

4. **Nginx configuration errors:**
   ```bash
   # Test nginx config
   docker-compose exec nginx nginx -t
   
   # Reload nginx
   docker-compose exec nginx nginx -s reload
   ```

### Performance Tuning

1. **Increase nginx worker processes:**
   ```nginx
   # In nginx/nginx.conf
   worker_processes auto;  # Uses all CPU cores
   ```

2. **Adjust rate limits:**
   ```nginx
   # In nginx/nginx.conf
   limit_req_zone $binary_remote_addr zone=api:10m rate=20r/s;  # Increase API rate
   ```

3. **Scale application:**
   ```yaml
   # In docker-compose.yml
   validator-api:
     deploy:
       replicas: 2  # Run multiple instances
   ```

## 📋 Maintenance

### Backup Database
```bash
# Create backup
docker-compose exec db pg_dump -U postgres validator > backup-$(date +%Y%m%d).sql

# Restore backup
docker-compose exec -T db psql -U postgres validator < backup-20241215.sql
```

### Update Application
```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose build validator-api
docker-compose up -d
```

### Clean Up
```bash
# Remove unused Docker resources
docker system prune -a

# Remove old images
docker image prune -a
```

## 🌐 Access Points

After deployment, your application will be available at:

### Web Interface
- **Main validator**: http://your-server/
- **Device authentication**: http://your-server/device-auth.html
- **Health check**: http://your-server/health

### API Endpoints
- **Start validation**: `POST /api/validate`
- **Check status**: `GET /api/validate/{id}/status`
- **Get report**: `GET /api/validate/{id}/report`
- **Device auth**: `POST /api/device-auth/start`

### Docker Hub Image
The application is also available as a pre-built image:
```bash
docker pull kiraje/azure-service-principal-validator:latest
```

## 📞 Support

For issues:
- Check logs: `docker-compose logs -f`
- Health check: `curl http://localhost/health`
- GitHub Issues: https://github.com/kiraje/AzureValidate/issues

This deployment setup provides a production-ready environment with proper reverse proxy, security headers, rate limiting, and monitoring capabilities.