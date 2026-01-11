# Development Guide

This guide is for developers who want to contribute to IoTStudio.

## Architecture Overview

### Backend

```
backend/
├── cmd/server/          # Application entry point
├── internal/
│   ├── server/          # HTTP & WebSocket server
│   ├── connections/     # Connection management
│   ├── protocols/       # Protocol handlers
│   ├── sessions/        # Session management
│   ├── devices/         # Device abstraction
│   ├── parser/          # Data parsing engine
│   ├── storage/         # Persistence layer
│   └── models/          # Data models
└── pkg/
    ├── api/            # API contracts
    └── utils/          # Utility functions
```

### Frontend

```
frontend/
├── src/
│   ├── components/     # React components
│   ├── hooks/          # Custom hooks
│   ├── stores/         # Zustand stores
│   ├── api/            # API client
│   └── types/          # TypeScript types
```

## Getting Started

### Prerequisites

- Go 1.21+
- Node.js 18+
- SQLite

### Setup

```bash
# Clone repository
git clone https://github.com/iotstudio/iotstudio.git
cd iotstudio

# Backend
cd backend
go mod download
go run cmd/server/main.go

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

## Running Tests

### Backend

```bash
cd backend
go test -v ./...
go test -race ./...
go test -cover ./...
```

### Frontend

```bash
cd frontend
npm run test
npm run test:coverage
```

## Code Style

### Go

- Follow standard Go conventions
- Run `gofmt` before committing
- Use `golint` to check code quality

```bash
gofmt -w .
golint ./...
```

### TypeScript

- Follow ESLint rules
- Run Prettier for formatting

```bash
npm run lint
npm run format
```

## Adding New Protocols

1. Create new protocol handler in `internal/protocols/`:

```go
package myprotocol

import (
    "context"
    "github.com/iotstudio/iotstudio/pkg/api"
)

type MyProtocolHandler struct {
    config api.ConnectionConfig
}

func NewHandler() *MyProtocolHandler {
    return &MyProtocolHandler{}
}

func (h *MyProtocolHandler) Connect(ctx context.Context, config api.ConnectionConfig) error {
    // Implementation
    return nil
}

func (h *MyProtocolHandler) Disconnect() error {
    // Implementation
    return nil
}

func (h *MyProtocolHandler) Read(ctx context.Context) ([]byte, error) {
    // Implementation
    return nil, nil
}

func (h *MyProtocolHandler) Write(ctx context.Context, data []byte) error {
    // Implementation
    return nil
}

func (h *MyProtocolHandler) IsConnected() bool {
    return false
}

func (h *MyProtocolHandler) GetMetrics() api.ConnectionMetrics {
    return api.ConnectionMetrics{}
}
```

2. Register protocol in connection manager

## Adding New Dashboard Widgets

1. Create widget component in `frontend/src/components/dashboard/`:

```tsx
import React from 'react'

interface MyWidgetProps {
  data: number
  label: string
}

export function MyWidget({ data, label }: MyWidgetProps) {
  return (
    <div className="my-widget">
      <h3>{label}</h3>
      <div className="value">{data}</div>
    </div>
  )
}
```

2. Add widget to dashboard component

## Database Migrations

Create migration files in `backend/internal/storage/sqlite/migrations/`:

```sql
-- 001_initial.up.sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    status TEXT NOT NULL
);
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Ensure all tests pass
6. Submit a pull request

## Debugging

### Backend

```bash
# Enable debug logging
LOG_LEVEL=debug go run cmd/server/main.go

# Connect debugger
dlv debug cmd/server/main.go
```

### Frontend

```bash
# Run in debug mode
npm run dev

# Run tests in watch mode
npm run test -- --watch
```
