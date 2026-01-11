# Deployment Guide

This guide covers how to deploy IoTStudio in various environments.

## Prerequisites

- Go 1.21 or higher
- Node.js 18 or higher
- SQLite 3 or higher
- Docker (optional)

## Local Development

### Backend Setup

```bash
cd backend
go mod download
go run cmd/server/main.go
```

The backend server will start on `http://localhost:8080`.

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend development server will be available at `http://localhost:5173`.

## Docker Deployment

### Build Docker Image

```bash
docker build -t iotstudio:latest .
```

### Run Docker Container

```bash
docker run -d \
  -p 8080:8080 \
  -v $(pwd)/data:/app/data \
  iotstudio:latest
```

### Docker Compose

```bash
docker-compose up -d
```

## Production Deployment

### Environment Variables

Create a `.env` file:

```
# Server
SERVER_ADDR=:8080
SERVER_ENV=production

# Database
DB_PATH=/app/data/iotstudio.db

# Logging
LOG_LEVEL=info
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Systemd Service

Create `/etc/systemd/system/iotstudio.service`:

```ini
[Unit]
Description=IoTStudio Backend
After=network.target

[Service]
Type=simple
User=iotstudio
WorkingDirectory=/opt/iotstudio
ExecStart=/opt/iotstudio/server
Restart=always
RestartSec=5
Environment="DB_PATH=/opt/iotstudio/data/iotstudio.db"

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable iotstudio
sudo systemctl start iotstudio
```

## Troubleshooting

### Backend won't start

1. Check Go version: `go version`
2. Verify dependencies: `go mod verify`
3. Check port availability: `lsof -i :8080`

### WebSocket connection fails

1. Verify WebSocket URL in frontend: `WS_URL=ws://your-domain.com/ws`
2. Check reverse proxy configuration for WebSocket upgrade headers
3. Review server logs for connection errors

### Database errors

1. Check database directory permissions
2. Verify SQLite is installed: `sqlite3 --version`
3. Check disk space: `df -h`
