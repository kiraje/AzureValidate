#!/bin/bash
# Script to install and configure nginx reverse proxy for Azure Service Principal Validator

set -e

echo "🚀 Installing Nginx Reverse Proxy for Azure Service Principal Validator"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}This script should not be run as root. Please run as a regular user with sudo privileges.${NC}"
   exit 1
fi

# Variables
DOMAIN=${1:-"azure-validator.local"}
APP_PORT=${2:-"3303"}
NGINX_CONFIG_NAME="azure-validator"

echo -e "${YELLOW}Configuration:${NC}"
echo "Domain: $DOMAIN"
echo "App Port: $APP_PORT"
echo "Nginx Config: $NGINX_CONFIG_NAME"
echo ""

# Install nginx if not already installed
if ! command -v nginx &> /dev/null; then
    echo -e "${YELLOW}Installing nginx...${NC}"
    sudo apt update
    sudo apt install -y nginx
    sudo systemctl enable nginx
else
    echo -e "${GREEN}Nginx is already installed${NC}"
fi

# Create nginx configuration
echo -e "${YELLOW}Creating nginx configuration...${NC}"

sudo tee /etc/nginx/sites-available/$NGINX_CONFIG_NAME > /dev/null <<EOF
# Azure Service Principal Validator - Nginx Configuration
server {
    listen 80;
    listen [::]:80;
    
    server_name $DOMAIN;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Client settings
    client_max_body_size 10M;
    client_body_timeout 60s;
    client_header_timeout 60s;
    
    # Rate limiting
    limit_req zone=general burst=20 nodelay;
    
    # Main application proxy
    location / {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass \$http_upgrade;
        
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$server_name;
        
        # Timeout settings for long Azure operations
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
    
    # API endpoints with rate limiting
    location /api/ {
        limit_req zone=api burst=10 nodelay;
        
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Extended timeouts for validation operations
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
        
        proxy_buffering off;
        proxy_request_buffering off;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://localhost:$APP_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        
        proxy_connect_timeout 5s;
        proxy_send_timeout 5s;
        proxy_read_timeout 5s;
        
        access_log off;
    }
    
    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        proxy_pass http://localhost:$APP_PORT;
        proxy_set_header Host \$host;
        
        expires 1d;
        add_header Cache-Control "public, immutable";
        
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }
    
    # Security: Deny access to sensitive files
    location ~ /\.(env|git) {
        deny all;
        access_log off;
        log_not_found off;
        return 404;
    }
    
    # Logging
    access_log /var/log/nginx/azure-validator.access.log;
    error_log /var/log/nginx/azure-validator.error.log;
}
EOF

# Add rate limiting to main nginx config if not present
if ! grep -q "limit_req_zone" /etc/nginx/nginx.conf; then
    echo -e "${YELLOW}Adding rate limiting configuration...${NC}"
    sudo sed -i '/http {/a\\n    # Rate limiting for Azure Validator\n    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;\n    limit_req_zone $binary_remote_addr zone=general:10m rate=30r/s;' /etc/nginx/nginx.conf
fi

# Enable the site
echo -e "${YELLOW}Enabling nginx site...${NC}"
sudo ln -sf /etc/nginx/sites-available/$NGINX_CONFIG_NAME /etc/nginx/sites-enabled/

# Test nginx configuration
echo -e "${YELLOW}Testing nginx configuration...${NC}"
if sudo nginx -t; then
    echo -e "${GREEN}Nginx configuration is valid${NC}"
else
    echo -e "${RED}Nginx configuration has errors. Please check the configuration.${NC}"
    exit 1
fi

# Reload nginx
echo -e "${YELLOW}Reloading nginx...${NC}"
sudo systemctl reload nginx

# Enable nginx service
sudo systemctl enable nginx

# Create logrotate configuration
echo -e "${YELLOW}Setting up log rotation...${NC}"
sudo tee /etc/logrotate.d/azure-validator-nginx > /dev/null <<EOF
/var/log/nginx/azure-validator.*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    sharedscripts
    postrotate
        if [ -f /var/run/nginx.pid ]; then
            kill -USR1 \$(cat /var/run/nginx.pid)
        fi
    endscript
}
EOF

# Set up basic firewall rules
if command -v ufw &> /dev/null; then
    echo -e "${YELLOW}Configuring firewall...${NC}"
    sudo ufw allow 'Nginx Full'
    echo -e "${GREEN}Firewall configured to allow HTTP and HTTPS${NC}"
fi

echo ""
echo -e "${GREEN}✅ Nginx reverse proxy installation completed!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Make sure your Azure Service Principal Validator is running on port $APP_PORT"
echo "2. Update your DNS to point $DOMAIN to this server's IP"
echo "3. Access your application at: http://$DOMAIN"
echo ""
echo -e "${YELLOW}To enable HTTPS with Let's Encrypt:${NC}"
echo "sudo apt install certbot python3-certbot-nginx"
echo "sudo certbot --nginx -d $DOMAIN"
echo ""
echo -e "${YELLOW}To check nginx status:${NC}"
echo "sudo systemctl status nginx"
echo "sudo nginx -t"
echo ""
echo -e "${YELLOW}Log files:${NC}"
echo "Access: /var/log/nginx/azure-validator.access.log"
echo "Error: /var/log/nginx/azure-validator.error.log"
EOF