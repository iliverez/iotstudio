package protocol

import (
	"context"

	"github.com/iotstudio/iotstudio/pkg/api"
)

// ProtocolHandler defines the interface for all protocol handlers
type ProtocolHandler interface {
	// Connect establishes a connection using the provided configuration
	Connect(ctx context.Context, config api.ConnectionConfig) error

	// Disconnect closes the connection
	Disconnect() error

	// Read reads data from the connection
	Read(ctx context.Context) ([]byte, error)

	// Write writes data to the connection
	Write(ctx context.Context, data []byte) error

	// IsConnected returns whether the connection is currently active
	IsConnected() bool

	// GetMetrics returns connection performance metrics
	GetMetrics() api.ConnectionMetrics
}

// ProtocolFactory is a function that creates a new protocol handler
type ProtocolFactory func() ProtocolHandler
