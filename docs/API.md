# API Reference

This document describes the REST API and WebSocket interfaces for IoTStudio.

## REST API

Base URL: `http://localhost:8080/api`

### Sessions

#### List Sessions

```
GET /api/sessions
```

**Response:**

```json
[
  {
    "id": "session-123",
    "name": "Factory Floor Monitoring",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "status": "running"
  }
]
```

#### Get Session

```
GET /api/sessions/{id}
```

#### Create Session

```
POST /api/sessions
Content-Type: application/json

{
  "name": "New Session"
}
```

#### Update Session

```
PUT /api/sessions/{id}
Content-Type: application/json

{
  "name": "Updated Name",
  "status": "running"
}
```

#### Delete Session

```
DELETE /api/sessions/{id}
```

### Connections

#### List Connections for Session

```
GET /api/sessions/{id}/connections
```

**Response:**

```json
[
  {
    "id": "conn-123",
    "sessionId": "session-123",
    "type": "modbus_tcp",
    "name": "PLC Connection",
    "config": "{\"host\":\"192.168.1.100\",\"port\":502}",
    "status": "connected",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
]
```

#### Create Connection

```
POST /api/sessions/{id}/connections
Content-Type: application/json

{
  "type": "modbus_tcp",
  "name": "PLC Connection",
  "config": {
    "host": "192.168.1.100",
    "port": 502,
    "timeout": 5,
    "keepAlive": true
  }
}
```

#### Delete Connection

```
DELETE /api/connections/{id}
```

### Devices

#### List Devices for Session

```
GET /api/sessions/{id}/devices
```

**Response:**

```json
[
  {
    "id": "device-123",
    "sessionId": "session-123",
    "connectionId": "conn-123",
    "address": 1,
    "name": "Temperature Sensor",
    "description": "Main temperature sensor",
    "parserId": "parser-123",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
]
```

#### Create Device

```
POST /api/sessions/{id}/devices
Content-Type: application/json

{
  "connectionId": "conn-123",
  "address": 1,
  "name": "Temperature Sensor",
  "parserId": "parser-123"
}
```

#### Delete Device

```
DELETE /api/devices/{id}
```

### Parsers

#### List Parsers

```
GET /api/parsers
```

**Response:**

```json
[
  {
    "id": "parser-123",
    "name": "Temperature Parser",
    "type": "visual",
    "visualRules": "[{\"name\":\"temp\",\"dataType\":\"float\",\"startOffset\":0,\"bitOffset\":0,\"bitWidth\":16,\"endianness\":\"big\",\"scale\":0.1,\"offset\":0}]",
    "javascript": "",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
]
```

#### Get Parser

```
GET /api/parsers/{id}
```

#### Create Parser

```
POST /api/parsers
Content-Type: application/json

{
  "name": "Temperature Parser",
  "type": "visual",
  "visualRules": [
    {
      "name": "temperature",
      "dataType": "float",
      "startOffset": 0,
      "bitOffset": 0,
      "bitWidth": 16,
      "endianness": "big",
      "scale": 0.1,
      "offset": 0
    }
  ]
}
```

#### Update Parser

```
PUT /api/parsers/{id}
Content-Type: application/json

{
  "name": "Updated Parser",
  "visualRules": [...]
}
```

#### Delete Parser

```
DELETE /api/parsers/{id}
```

## WebSocket

### Connection

```
ws://localhost:8080/ws
```

### Message Format

#### Subscribe to Session

```json
{
  "type": "subscribe",
  "sessionId": "session-123"
}
```

#### Unsubscribe from Session

```json
{
  "type": "unsubscribe",
  "sessionId": "session-123"
}
```

#### Data Message (Server → Client)

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

#### Error Message (Server → Client)

```json
{
  "type": "error",
  "timestamp": 1704067200000,
  "error": "Connection lost to device"
}
```

#### Status Message (Server → Client)

```json
{
  "type": "status",
  "sessionId": "session-123",
  "timestamp": 1704067200000,
  "status": "running"
}
```

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |
| 503 | Service Unavailable - Try again later |

## Rate Limiting

- API requests: 100 requests/minute per IP
- WebSocket connections: 10 concurrent connections per IP
