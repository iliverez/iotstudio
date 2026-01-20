package tcp

import (
	"context"
	"fmt"
	"net"
	"sync"
	"time"

	"github.com/iotstudio/iotstudio/pkg/api"
	"github.com/rs/zerolog/log"
)

type TCPHandler struct {
	config    TCPConfig
	conn      net.Conn
	mu        sync.RWMutex
	metrics   api.ConnectionMetrics
	connected bool
}

func NewTCPHandler(config TCPConfig) *TCPHandler {
	return &TCPHandler{
		config:    config,
		connected: false,
		metrics:   api.ConnectionMetrics{},
	}
}

func (h *TCPHandler) Connect(ctx context.Context, cfg api.ConnectionConfig) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.connected {
		return fmt.Errorf("already connected to %s", h.config.Address)
	}

	timeout := 30 * time.Second
	if h.config.Timeout > 0 {
		timeout = h.config.Timeout
	}

	dialer := &net.Dialer{
		Timeout: timeout,
	}

	conn, err := dialer.DialContext(ctx, "tcp", h.config.Address)
	if err != nil {
		h.metrics.ErrorCount++
		return fmt.Errorf("failed to connect to %s: %w", h.config.Address, err)
	}

	h.conn = conn
	h.connected = true
	h.metrics.BytesWritten = 0
	h.metrics.BytesRead = 0
	h.metrics.ReadCount = 0
	h.metrics.WriteCount = 0

	log.Info().
		Str("address", h.config.Address).
		Msg("TCP connection established")

	return nil
}

func (h *TCPHandler) Disconnect() error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if !h.connected {
		return nil
	}

	if h.conn != nil {
		err := h.conn.Close()
		h.conn = nil
		h.connected = false

		if err != nil {
			log.Error().Err(err).Msg("Error closing TCP connection")
			return err
		}
	}

	log.Info().
		Str("address", h.config.Address).
		Msg("TCP connection closed")

	return nil
}

func (h *TCPHandler) Read(ctx context.Context) ([]byte, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if !h.connected || h.conn == nil {
		return nil, fmt.Errorf("not connected")
	}

	buffer := make([]byte, h.config.ReadBufferSize)
	n, err := h.conn.Read(buffer)
	if err != nil {
		h.metrics.ErrorCount++
		return nil, fmt.Errorf("read error: %w", err)
	}

	data := buffer[:n]
	h.metrics.BytesRead += int64(n)
	h.metrics.ReadCount++
	h.metrics.LastRead = time.Now()

	return data, nil
}

func (h *TCPHandler) Write(ctx context.Context, data []byte) error {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if !h.connected || h.conn == nil {
		return fmt.Errorf("not connected")
	}

	n, err := h.conn.Write(data)
	if err != nil {
		h.metrics.ErrorCount++
		return fmt.Errorf("write error: %w", err)
	}

	h.metrics.BytesWritten += int64(n)
	h.metrics.WriteCount++
	h.metrics.LastWrite = time.Now()

	return nil
}

func (h *TCPHandler) IsConnected() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.connected
}

func (h *TCPHandler) GetMetrics() api.ConnectionMetrics {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.metrics
}

func (h *TCPHandler) SetTimeout(timeout time.Duration) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.config.Timeout = timeout
}

func (h *TCPHandler) GetTimeout() time.Duration {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.config.Timeout
}
