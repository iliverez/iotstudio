# IoTStudio Agent Guide

This guide helps AI agents understand the codebase structure and development workflow.

## Project Structure

```
iotstudio/
├── backend/          # Go backend
├── frontend/         # React + TypeScript frontend
├── docs/            # Documentation
├── Dockerfile       # Multi-stage Docker build
├── docker-compose.yml
└── README.md
```

## Backend Development

### Key Patterns

1. **Protocol Handler Interface**: All protocols implement `ProtocolHandler` in `internal/protocols/protocol.go`
2. **Storage Interface**: All storage backends implement `Storage` in `internal/storage/storage.go`
3. **Server**: Main HTTP/WebSocket server in `internal/server/`
4. **Models**: Data models in `internal/models/`

### Adding a New Protocol

1. Create handler in `internal/protocols/protocolname/`
2. Implement `ProtocolHandler` interface
3. Register in connection manager
4. Add tests

### Running Backend Tests

```bash
cd backend
go test -v ./...
go test -race ./...
```

## Frontend Development

### Key Patterns

1. **State Management**: Zustand store in `src/stores/dashboardStore.ts`
2. **WebSocket**: Custom hook in `src/hooks/useWebSocket.ts`
3. **API Client**: Axios-based in `src/api/client.ts`
4. **Components**: Organized by feature in `src/components/`

### Adding a New Widget

1. Create component in `src/components/dashboard/`
2. Add to dashboard component
3. Implement data fetching hook
4. Add tests

### Running Frontend Tests

```bash
cd frontend
npm run test
npm run test:coverage
```

## Testing

### Backend Test Structure

```
backend/tests/
├── unit/          # Unit tests
└── integration/   # Integration tests
```

### Frontend Test Structure

```
frontend/src/
└── __tests__/     # Component tests
```

## Build Commands

### Backend

```bash
cd backend
go build -o server ./cmd/server
```

### Frontend

```bash
cd frontend
npm run build
```

### Docker

```bash
docker build -t iotstudio:latest .
docker-compose up
```

## Common Tasks

### Fix linting issues
```bash
# Backend
cd backend && gofmt -w . && golint ./...

# Frontend
cd frontend && npm run lint && npm run format
```

### Run type checking
```bash
# Frontend
cd frontend && npm run type-check
```

### Check test coverage
```bash
# Backend
cd backend && go test -cover ./...

# Frontend
cd frontend && npm run test:coverage
```

## API Endpoints

- `GET /api/sessions` - List sessions
- `POST /api/sessions` - Create session
- `GET /api/sessions/{id}/connections` - List connections
- `POST /api/sessions/{id}/connections` - Create connection
- `GET /api/sessions/{id}/devices` - List devices
- `POST /api/sessions/{id}/devices` - Create device
- `GET /api/parsers` - List parsers
- `POST /api/parsers` - Create parser

## WebSocket Events

- `subscribe` - Subscribe to session data
- `unsubscribe` - Unsubscribe from session
- `data` - Real-time data from device
- `error` - Error messages
- `status` - Connection status updates

## Important Notes

1. Always run tests before committing
2. Update documentation when adding features
3. Follow existing code patterns
4. Add tests for new features
5. Check type safety in frontend
6. Handle errors appropriately
7. Use proper logging (zerolog for backend)
