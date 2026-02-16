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
  parserId: string
  type: 'modbus_tcp' | 'modbus_rtu'
  name: string
  config: string
  framing: string
  delimiter: string | null
  fixedSize: number | null
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  createdAt: string
  updatedAt: string
}

export interface Device {
  id: string
  sessionId: string
  connectionId: string
  address: string
  name: string
  description: string
  parserId: string
  createdAt: string
  updatedAt: string
}

export interface Parser {
  id: string
  name: string
  type: 'visual' | 'javascript' | 'builtin' | 'modbus'
  fields: ParserField[]
  builtinType: string | null
  modbusRegisters?: ModbusRegister[]
  createdAt: string
  updatedAt: string
}

export interface ModbusRegister {
  name: string
  registerType: 'coil' | 'discrete_input' | 'holding_register' | 'input_register'
  address: number
  quantity: number
  dataType: 'bool' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'float32' | 'float64'
  endianness: 'big' | 'little'
  scale: number
  offset: number
  engineeringUnitId?: string
}

export interface ParserField {
  name: string
  deviceId: string
  dataType: string
  offset: number
  bitOffset: number
  bitWidth: number
  endianness: string
  scale: number
  valueOffset: number
  arrayLength: number
  engineeringUnitId?: string
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

export type WidgetType = 'linechart' | 'gauge' | 'datagrid' | 'statuscard'

export interface Widget {
  id: string
  type: WidgetType
  title: string
  config: Record<string, unknown>
  layout: {
    x: number
    y: number
    w: number
    h: number
    minW?: number
    minH?: number
    maxW?: number
    maxH?: number
  }
}

export interface Dashboard {
  id: string
  sessionId: string
  name: string
  widgets: Widget[]
  createdAt: string
  updatedAt: string
}

export type AggregationType = 'average' | 'max' | 'min' | 'last'

export interface EngineeringUnit {
  id: string
  name: string
  symbol: string
  description: string
  createdAt: string
}

export interface SignalConfig {
  name: string
  loggingPeriod: number // milliseconds
  aggregation: AggregationType
  engineeringUnitId?: string
}

export interface MonitoringSession {
  id: string
  name: string
  deviceId: string
  samplingPeriod: number // milliseconds
  defaultLoggingPeriod: number // milliseconds
  defaultAggregation: AggregationType
  signalConfigs: SignalConfig[]
  startTime: number // timestamp
  endTime: number // timestamp
  dataPoints: AggregatedDataPoint[]
  rawDataPoints: RawDataPoint[]
  comments?: string
  createdAt: string
}

export interface RawDataPoint {
  timestamp: number
  data: Record<string, unknown>
}

export interface AggregatedDataPoint {
  timestamp: number
  periodStart: number
  periodEnd: number
  data: Record<string, unknown>
}
