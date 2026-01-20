# IoTStudio Phase 1 Implementation Plan

## Project Overview
A modular real-time telemetry visualization application with browser-based UI, supporting Modbus TCP/RTU connections with custom dashboard creation and data parsing capabilities.

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Backend | Go 1.21+ | Excellent concurrency, efficient I/O, strong ecosystem |
| Frontend | React 18 + TypeScript | Modern, component-based, great ecosystem |
| Real-time | WebSocket (gorilla/websocket) | Low-latency bidirectional communication |
| Charts | Chart.js | Canvas-based, excellent for 60fps real-time updates |
| State | Zustand | Lightweight, excellent for high-frequency updates |
| Database | SQLite (modernc.org/sqlite) + Tiger Data | Embedded + scalable time-series |
| JS Engine | goja | Pure Go JS engine, safe sandboxed execution |
| Build | Vite (frontend) | Fast dev server, optimized production builds |

## Directory Structure

```
iotstudio/
├── backend/
│   ├── cmd/
│   │   └── server/
│   │       └── main.go
│   ├── internal/
│   │   ├── server/
│   │   │   ├── http.go
│   │   │   └── websocket.go
│   │   ├── connections/
│   │   │   ├── manager.go
│   │   │   └── connection.go
│   │   ├── protocols/
│   │   │   ├── modbus/
│   │   │   │   ├── tcp.go
│   │   │   │   ├── rtu.go
│   │   │   │   └── types.go
│   │   │   └── protocol.go (interface)
│   │   ├── sessions/
│   │   │   ├── session.go
│   │   │   └── manager.go
│   │   ├── devices/
│   │   │   └── device.go
│   │   ├── parser/
│   │   │   ├── visual.go
│   │   │   ├── javascript.go
│   │   │   └── engine.go
│   │   ├── storage/
│   │   │   ├── sqlite/
│   │   │   │   ├── db.go
│   │   │   │   └── migrations/
│   │   │   ├── tigerdata/
│   │   │   │   └── client.go
│   │   │   └── storage.go (interface)
│   │   └── models/
│   │       ├── session.go
│   │       ├── connection.go
│   │       ├── device.go
│   │       └── parser.go
│   ├── pkg/
│   │   ├── api/
│   │   │   └── types.go
│   │   └── utils/
│   └── tests/
│       ├── integration/
│       └── unit/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── dashboard/
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── LineChart.tsx
│   │   │   │   ├── Gauge.tsx
│   │   │   │   └── DataGrid.tsx
│   │   │   ├── parser/
│   │   │   │   ├── VisualEditor.tsx
│   │   │   │   └── JSEditor.tsx
│   │   │   ├── connection/
│   │   │   │   └── ConnectionPanel.tsx
│   │   │   └── session/
│   │   │   │   └── SessionManager.tsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   └── useData.ts
│   │   ├── stores/
│   │   │   └── dashboardStore.ts
│   │   ├── api/
│   │   │   └── client.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── docs/
│   ├── DEPLOYMENT.md
│   ├── USAGE.md
│   ├── API.md
│   └── DEVELOPMENT.md
├── docker-compose.yml
└── README.md
```

## Phase 1 Implementation Steps

### Step 1: Project Setup & Configuration (Week 1)

**Backend:**
- Initialize Go module
- Set up project structure
- Configure CI/CD (GitHub Actions)
- Create base interfaces and types

**Frontend:**
- Initialize Vite + React + TypeScript project
- Set up ESLint, Prettier
- Configure build scripts
- Set up base component structure

**Deliverables:**
- Working build pipeline
- Basic project scaffolding
- CI/CD configuration

### Step 2: Backend Core - Connection Manager (Week 1-2)

**Tasks:**
1. Implement `ProtocolHandler` interface
   ```go
   type ProtocolHandler interface {
       Connect(ctx context.Context, config ConnectionConfig) error
       Disconnect() error
       Read(ctx context.Context) ([]byte, error)
       Write(ctx context.Context, data []byte) error
       GetMetrics() ConnectionMetrics
   }
   ```

2. Create `ConnectionManager` with connection pooling
3. Implement lifecycle management (connect, disconnect, retry with backoff)
4. Add metrics tracking (bytes read/written, error rates, latency)

**Testing:**
- Unit tests for connection lifecycle
- Integration tests with mock protocol handlers
- Concurrent connection handling tests

### Step 3: Protocol Implementation - Modbus TCP/RTU (Week 2-3)

**Tasks:**

**Modbus TCP:**
- Implement MBAP header parsing
- PDU handling (function codes 0x01-0x06, 0x0F, 0x10)
- TCP connection management with keep-alive
- Transaction ID matching
- Error handling with retry logic

**Modbus RTU:**
- Serial port communication using `go.bug.st/serial`
- CRC-16-MODBUS calculation
- Timing compliance (t1.5 and t3.5)
- RS-485 support

**Shared:**
- Exception code handling
- Data model implementation (coils, registers, inputs)
- Data scaling and conversion utilities

**Testing:**
- Unit tests for frame parsing
- Integration tests with Modbus simulators (modbus-simulator)
- Timing compliance tests for RTU
- Error injection tests

### Step 4: Session Management (Week 3)

**Tasks:**
1. Implement `Session` struct (contains multiple connections and devices)
2. Create `SessionManager` for session CRUD operations
3. Add session state persistence to SQLite
4. Implement session lifecycle (create, start, stop, delete)

**Data Models:**
```go
type Session struct {
    ID        string
    Name      string
    CreatedAt time.Time
    Status    SessionStatus // idle, running, paused, error
}

type Connection struct {
    ID          string
    SessionID    string
    Type        ConnectionType // modbus_tcp, modbus_rtu
    Config      json.RawMessage
    Status      ConnectionStatus
}

type Device struct {
    ID           string
    SessionID     string
    ConnectionID  string
    Address      uint8 // Slave ID or Unit ID
    Name         string
    ParserID     string
}
```

**Testing:**
- Unit tests for session operations
- Integration tests with SQLite
- Concurrent session management tests

### Step 5: Data Parser Engine (Week 3-4)

**Tasks:**

**Visual Parser:**
- Bit field extraction (offset, width, endianness)
- Scaling formulas (linear, custom)
- Data type conversion (int, uint, float, bool)

**JavaScript Parser:**
- Integrate `goja` for safe JS execution
- Sandbox environment with exposed APIs
- Parser validation and error handling

**Parser Configuration:**
```go
type Parser struct {
    ID          string
    Name        string
    Type        ParserType // visual, javascript
    VisualRules []VisualRule
    JavaScript  string
}

type VisualRule struct {
    Name        string
    DataType    DataType
    StartOffset int
    BitOffset   int
    BitWidth    int
    Endianness  Endianness
    Scale       float64
    Offset      float64
}
```

**Testing:**
- Unit tests for parsing logic
- JS sandbox security tests
- Performance benchmarks (10K+ points/second)
- Invalid input handling tests

### Step 6: Storage Layer (Week 4)

**Tasks:**

**SQLite Implementation:**
- Database schema with migrations
- CRUD operations for sessions, connections, devices, parsers
- SQLite for configuration and metadata
- Query optimization

**Tiger Data Integration:**
- Column-store implementation for time-series data
- Batch write optimization
- Time-based queries for data export

**Storage Interface:**
```go
type Storage interface {
    // Sessions
    CreateSession(ctx context.Context, session *Session) error
    GetSession(ctx context.Context, id string) (*Session, error)
    ListSessions(ctx context.Context) ([]*Session, error)
    UpdateSession(ctx context.Context, session *Session) error
    DeleteSession(ctx context.Context, id string) error

    // Connections
    CreateConnection(ctx context.Context, conn *Connection) error
    // ... similar CRUD for connections, devices, parsers

    // Time-series data (Tiger Data)
    WriteDataPoints(ctx context.Context, points []DataPoint) error
    QueryData(ctx context.Context, req QueryRequest) ([]DataPoint, error)
}
```

**Testing:**
- Unit tests for CRUD operations
- Migration rollback tests
- Concurrent access tests
- Data integrity tests

### Step 7: Backend Server - HTTP & WebSocket (Week 4-5)

**Tasks:**

**HTTP API:**
- RESTful endpoints for CRUD operations
  - `/api/sessions` - GET, POST, PUT, DELETE
  - `/api/sessions/{id}/connections` - GET, POST, DELETE
  - `/api/sessions/{id}/devices` - GET, POST, DELETE
  - `/api/parsers` - GET, POST, PUT, DELETE
- Request validation
- Error handling and logging

**WebSocket Server:**
- Connection endpoint `/ws`
- Session-specific channels
- Real-time data streaming
- Binary/JSON message support
- Authentication (JWT tokens)

**Message Format:**
```json
{
  "type": "data",
  "sessionId": "session-123",
  "deviceId": "device-456",
  "timestamp": 1704067200000,
  "data": {
    "temperature": 23.5,
    "humidity": 65.2
  }
}
```

**Testing:**
- API endpoint tests
- WebSocket connection tests
- Message format validation tests
- Load tests (100+ concurrent connections)

### Step 8: Frontend - WebSocket Client & State Management (Week 5)

**Tasks:**

**WebSocket Hook:**
```typescript
interface WebSocketHook {
  socket: WebSocket | null
  isConnected: boolean
  lastMessage: Message | null
  sendMessage: (message: any) => void
  subscribe: (sessionId: string, callback: (data: any) => void) => void
  unsubscribe: (sessionId: string) => void
}
```

**Zustand Store:**
```typescript
interface DashboardStore {
  sessions: Session[]
  activeSessionId: string | null
  metrics: Record<string, any>
  connections: ConnectionState[]

  // Actions
  setSessions: (sessions: Session[]) => void
  setActiveSession: (id: string) => void
  updateMetric: (key: string, value: any) => void

  // Transient update for 60fps
  updateMetricTransient: (key: string, value: any) => void
}
```

**Testing:**
- Hook unit tests
- Store behavior tests
- WebSocket reconnection tests

### Step 9: Frontend - Dashboard Components (Week 5-6)

**Tasks:**

**Chart.js Integration:**
```typescript
interface LineChartProps {
  data: DataPoint[]
  width?: number
  height?: number
  maxPoints?: number
  updateInterval?: number
}

// Optimized for 60fps
// - Disable animations for real-time
// - Circular buffer for data points
// - Batched updates
```

**Widgets:**
- LineChart (real-time time-series)
- Gauge (single value display)
- DataGrid (tabular data)
- StatusCard (connection status)

**Dashboard Builder:**
- Drag-and-drop layout
- Grid system (react-grid-layout)
- Widget configuration panel
- Layout persistence

**Testing:**
- Component rendering tests
- Performance tests (measure render time)
- Memory leak tests (long-running sessions)

### Step 10: Frontend - Parser UI (Week 6)

**Tasks:**

**Visual Editor:**
- Bit field visualizer
- Endianness toggle
- Scale/offset inputs
- Real-time preview with sample data

**JavaScript Editor:**
- Monaco Editor integration
- Syntax highlighting
- API documentation
- Code validation and testing

**Parser Manager:**
- Create, edit, delete parsers
- Assign parsers to devices
- Parser templates library

**Testing:**
- UI component tests
- Parser configuration tests
- User flow tests

### Step 11: Frontend - Connection & Session UI (Week 6-7)

**Tasks:**

**Connection Panel:**
- Connection type selector (Modbus TCP/RTU)
- Connection form with validation
- Connection status indicator
- Real-time metrics display

**Session Manager:**
- Session list view
- Create/edit session modal
- Start/stop session controls
- Session status dashboard

**Device Manager:**
- Device list per session
- Device configuration
- Parser assignment

**Testing:**
- User flow integration tests
- Form validation tests
- Error handling tests

### Step 12: Integration & Testing (Week 7)

**Tasks:**

**Integration Tests:**
- Full stack tests (frontend → API → backend → protocol → mock device)
- End-to-end user workflows
- WebSocket communication tests
- Data persistence tests

**Performance Testing:**
- Load testing (simulated 1000+ data points/second)
- Memory profiling
- WebSocket connection limits
- Database query optimization

**Security Tests:**
- Input validation tests
- XSS prevention tests
- WebSocket authentication tests
- JS sandbox escape tests

### Step 13: Documentation (Week 7-8)

**Deliverables:**

**DEPLOYMENT.md:**
- Prerequisites (Go 1.21+, Node 18+, SQLite)
- Local development setup
- Docker deployment (multi-stage build)
- Production deployment guide
- Environment variables reference
- Troubleshooting common issues

**USAGE.md:**
- Getting started tutorial
- Creating first session
- Adding Modbus connections
- Configuring parsers
- Building dashboards
- Common use cases
- Tips and best practices

**API.md:**
- REST API reference
- WebSocket message format
- Error codes and handling
- Rate limiting information

**DEVELOPMENT.md:**
- Architecture overview
- Contributing guidelines
- Code style guide
- Running tests
- Adding new protocols
- Adding new widgets

**README.md:**
- Project overview
- Features
- Quick start
- Screenshots (when available)
- License information

### Step 14: Final Polish (Week 8)

**Tasks:**
- Bug fixes from testing
- Performance optimization
- UX improvements
- Error message refinement
- Accessibility improvements
- Code cleanup and refactoring

## Testing Strategy

### Unit Tests
- Target: 80%+ code coverage
- Tools: Go testing, Jest/Vitest
- Run: On every PR, on main branch

### Integration Tests
- Database integration
- Protocol communication
- WebSocket messaging
- Run: On every PR, nightly on main

### End-to-End Tests
- Playwright for frontend user flows
- Go test for backend workflows
- Run: Before release

### Performance Tests
- k6 for load testing
- pprof for Go profiling
- Run: Weekly, before releases

## Deployment Architecture

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTPS/WSS
       ▼
┌─────────────────────┐
│   Reverse Proxy     │
│   (Nginx/Caddy)     │
└──────┬──────────────┘
       │ HTTP/WS
       ▼
┌─────────────────────┐
│   Go Backend        │
│   - HTTP Server     │
│   - WebSocket       │
│   - Modbus Client   │
└──────┬──────────────┘
       │
       ├──────────────┐
       ▼              ▼
┌─────────────┐  ┌──────────────┐
│   SQLite    │  │ Tiger Data   │
│ (Config)    │  │ (Time-series)│
└─────────────┘  └──────────────┘
```

### Docker Deployment

```dockerfile
# Multi-stage build
FROM golang:1.21 AS builder
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN CGO_ENABLED=1 GOOS=linux go build -o server ./cmd/server

FROM node:18 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM alpine:latest
RUN apk --no-cache add ca-certificates sqlite
WORKDIR /app
COPY --from=builder /app/backend/server .
COPY --from=frontend-builder /app/frontend/dist ./static
EXPOSE 8080
CMD ["./server"]
```

## Success Criteria for Phase 1

1. ✅ Modbus TCP connection can be created and data read successfully
2. ✅ Modbus RTU connection can be created and data read successfully
3. ✅ Sessions can be created, started, stopped, and deleted
4. ✅ Multiple connections can be added to a session
5. ✅ Devices can be defined and mapped to connections
6. ✅ Visual parser can extract data from raw bytes
7. ✅ JavaScript parser can process data with custom logic
8. ✅ Real-time data streaming via WebSocket at 60fps
9. ✅ Dashboard widgets display data correctly
10. ✅ Session configuration persists across application restarts
11. ✅ All tests pass with 80%+ coverage
12. ✅ Complete documentation available
13. ✅ Docker deployment works end-to-end
14. ✅ Application can handle 100+ concurrent connections
15. ✅ Data throughput: 1000+ data points/second

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Modbus device compatibility | Medium | Test with multiple device types, provide configuration templates |
| WebSocket performance at scale | High | Use connection pooling, implement backpressure, load test extensively |
| JavaScript sandbox security | High | Use goja with strict restrictions, limit API exposure, security audit |
| Time-series database performance | Medium | Implement batching, test with realistic data volumes, provide SQLite fallback |
| Real-time rendering performance | High | Use canvas-based charts, implement data buffering, profile extensively |

## Timeline Summary

| Week | Focus |
|------|-------|
| 1 | Setup, Connection Manager |
| 2 | Modbus TCP/RTU Implementation |
| 3 | Session Management, Parser Engine |
| 4 | Storage Layer, HTTP/WebSocket Server |
| 5 | WebSocket Client, State Management, Dashboard Components |
| 6 | Parser UI, Connection/Session UI |
| 7 | Integration & Testing |
| 8 | Documentation, Final Polish |
