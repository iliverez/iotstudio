# IoTStudio

A modular real-time telemetry visualization application with browser-based UI, supporting Modbus TCP/RTU connections with custom dashboard creation and data parsing capabilities.

## Features

- **Modbus Protocol Support**: TCP and RTU connections
- **Real-time Dashboard**: Browser-based UI with 60fps updates
- **Custom Data Parsing**: Visual and JavaScript-based parsers
- **Session Management**: Group multiple connections and devices
- **Data Persistence**: SQLite + Tiger Data for time-series storage

## Quick Start

### Prerequisites

- Go 1.21+
- Node.js 18+
- SQLite

### Backend

```bash
cd backend
go mod download
go run cmd/server/main.go
```

The backend server will start on `http://localhost:8080`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:5173`.

## Docker

Build and run with Docker:

```bash
docker build -t iotstudio:latest .
docker run -p 8080:8080 iotstudio:latest
```

## Documentation

- [Deployment Guide](docs/DEPLOYMENT.md)
- [User Guide](docs/USAGE.md)
- [API Reference](docs/API.md)
- [Development Guide](docs/DEVELOPMENT.md)

## License

MIT License - see LICENSE file for details
