export interface Session {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  status: 'idle' | 'running' | 'paused' | 'error'
}

export interface Connection {
  id: string
  sessionId: string
  type: 'modbus_tcp' | 'modbus_rtu'
  name: string
  config: string
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  createdAt: string
  updatedAt: string
}

export interface Device {
  id: string
  sessionId: string
  connectionId: string
  address: number
  name: string
  description: string
  parserId: string
  createdAt: string
  updatedAt: string
}

export interface Parser {
  id: string
  name: string
  type: 'visual' | 'javascript'
  visualRules: string
  javascript: string
  createdAt: string
  updatedAt: string
}

export interface VisualRule {
  name: string
  dataType: string
  startOffset: number
  bitOffset: number
  bitWidth: number
  endianness: string
  scale: number
  offset: number
}

export interface DataPoint {
  sessionId: string
  deviceId: string
  timestamp: number
  data: Record<string, unknown>
}

export interface WebSocketMessage {
  type: 'data' | 'error' | 'status'
  sessionId?: string
  deviceId?: string
  timestamp: number
  data?: Record<string, unknown>
  error?: string
}

export interface ConnectionState {
  sessionId: string
  connectionId: string
  status: string
  metrics: {
    bytesRead: number
    bytesWritten: number
    readCount: number
    writeCount: number
    errorCount: number
    lastRead: string
    lastWrite: string
  }
}
