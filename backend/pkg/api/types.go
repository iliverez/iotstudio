package api

import "time"

// ConnectionType defines the type of connection
type ConnectionType string

const (
	ModbusTCP ConnectionType = "modbus_tcp"
	ModbusRTU ConnectionType = "modbus_rtu"
)

// ConnectionStatus represents the status of a connection
type ConnectionStatus string

const (
	StatusDisconnected ConnectionStatus = "disconnected"
	StatusConnecting   ConnectionStatus = "connecting"
	StatusConnected    ConnectionStatus = "connected"
	StatusError        ConnectionStatus = "error"
)

// SessionStatus represents the status of a session
type SessionStatus string

const (
	SessionIdle    SessionStatus = "idle"
	SessionRunning SessionStatus = "running"
	SessionPaused  SessionStatus = "paused"
	SessionError   SessionStatus = "error"
)

// ConnectionConfig is the base configuration for all connections
type ConnectionConfig struct {
	ID       string         `json:"id"`
	SessionID string        `json:"sessionId"`
	Type     ConnectionType `json:"type"`
	Name     string         `json:"name"`
	Enabled  bool           `json:"enabled"`
}

// ModbusTCPConfig is configuration for Modbus TCP connections
type ModbusTCPConfig struct {
	ConnectionConfig
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Timeout     int    `json:"timeout"` // in seconds
	KeepAlive   bool   `json:"keepAlive"`
	MaxRetries  int    `json:"maxRetries"`
	RetryDelay  int    `json:"retryDelay"` // in milliseconds
}

// ModbusRTUConfig is configuration for Modbus RTU connections
type ModbusRTUConfig struct {
	ConnectionConfig
	Port        string `json:"port"`
	BaudRate    int    `json:"baudRate"`
	DataBits    int    `json:"dataBits"`
	Parity      string `json:"parity"`
	StopBits    int    `json:"stopBits"`
	Timeout     int    `json:"timeout"` // in milliseconds
	MaxRetries  int    `json:"maxRetries"`
	RetryDelay  int    `json:"retryDelay"` // in milliseconds
}

// ConnectionMetrics tracks connection performance metrics
type ConnectionMetrics struct {
	BytesRead     int64     `json:"bytesRead"`
	BytesWritten  int64     `json:"bytesWritten"`
	ReadCount     int64     `json:"readCount"`
	WriteCount    int64     `json:"writeCount"`
	ErrorCount    int64     `json:"errorCount"`
	LastRead      time.Time `json:"lastRead"`
	LastWrite     time.Time `json:"lastWrite"`
	AverageLatency float64  `json:"averageLatency"` // in milliseconds
}

// Message represents a WebSocket message
type Message struct {
	Type      string                 `json:"type"`
	SessionID string                 `json:"sessionId,omitempty"`
	DeviceID  string                 `json:"deviceId,omitempty"`
	Timestamp int64                  `json:"timestamp"`
	Data      map[string]interface{} `json:"data"`
	Error     string                 `json:"error,omitempty"`
}
