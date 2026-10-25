#!/usr/bin/env bash
# ==============================================================================
# ParkShare Cloud - EC2 Production Instance Provisioning & Setup Script
# ==============================================================================
set -euo pipefail

echo "==> Starting ParkShare Cloud EC2 Setup..."

# 1. Update OS Packages
sudo dnf update -y || sudo apt-get update -y

# 2. Install Node.js 22 LTS, Git, and Nginx
if command -v dnf &> /dev/null; then
    sudo dnf install -y git nginx
    # Install Node.js 22 on Amazon Linux 2023
    sudo dnf install -y nodejs npm
else
    sudo apt-get install -y curl git nginx
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 3. Install Process Manager (PM2)
sudo npm install -g pm2

# 4. Clone / Pull Application Code
APP_DIR="/var/www/parkshare-cloud"
if [ ! -d "$APP_DIR" ]; then
    sudo mkdir -p "$APP_DIR"
    sudo git clone https://github.com/zaindesai07/parkshare-cloud.git "$APP_DIR"
else
    cd "$APP_DIR"
    sudo git fetch origin
    sudo git reset --hard origin/main
fi

sudo chown -R ec2-user:ec2-user "$APP_DIR" 2>/dev/null || sudo chown -R ubuntu:ubuntu "$APP_DIR" 2>/dev/null || true
cd "$APP_DIR"

# 5. Retrieve Production Secrets from AWS SSM Parameter Store if available
AWS_REGION="${AWS_REGION:-us-east-1}"
if command -v aws &> /dev/null; then
    echo "Retrieving parameters from AWS SSM Parameter Store..."
    JWT_SECRET=$(aws ssm get-parameter --name "/parkshare/prod/jwt_secret" --with-decryption --query "Parameter.Value" --output text --region "$AWS_REGION" 2>/dev/null || echo "parkshare_prod_jwt_secret_fallback_key")
    DATABASE_URL=$(aws ssm get-parameter --name "/parkshare/prod/database_url" --with-decryption --query "Parameter.Value" --output text --region "$AWS_REGION" 2>/dev/null || echo "")
    S3_BUCKET=$(aws ssm get-parameter --name "/parkshare/prod/s3_bucket" --query "Parameter.Value" --output text --region "$AWS_REGION" 2>/dev/null || echo "")
    SNS_TOPIC_ARN=$(aws ssm get-parameter --name "/parkshare/prod/sns_topic_arn" --query "Parameter.Value" --output text --region "$AWS_REGION" 2>/dev/null || echo "")
else
    JWT_SECRET="parkshare_prod_jwt_secret_fallback_key"
    DATABASE_URL=""
    S3_BUCKET=""
    SNS_TOPIC_ARN=""
fi

# Write backend environment
cat <<EOF > backend/.env
PORT=5050
HOST=0.0.0.0
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
DATABASE_URL=${DATABASE_URL}
DB_SSL=true
AWS_REGION=${AWS_REGION}
AWS_S3_BUCKET=${S3_BUCKET}
AWS_SNS_TOPIC_ARN=${SNS_TOPIC_ARN}
EOF

# 6. Install Dependencies & Build
npm --prefix backend install --omit=dev
npm --prefix frontend install
npm --prefix frontend run build

# 7. Configure Nginx Reverse Proxy
sudo bash -c 'cat <<EOF > /etc/nginx/conf.d/parkshare.conf
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # Frontend Static Distribution
    root /var/www/parkshare-cloud/frontend/dist;
    index index.html;

    # Health check passthrough for ALB
    location = /health {
        proxy_pass http://127.0.0.1:5050/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # Backend API Routing
    location /api/ {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # SPA Client Routing
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF'

# Enable & Restart Nginx
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

# 8. Start Backend with PM2
cd "$APP_DIR/backend"
pm2 delete parkshare-api 2>/dev/null || true
pm2 start src/server.js --name "parkshare-api" -i max
pm2 save
pm2 startup systemd -u "$(whoami)" --hp "$HOME" 2>/dev/null || true

echo "==> ParkShare Cloud deployment complete & running!"
