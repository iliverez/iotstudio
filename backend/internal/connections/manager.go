package connections

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/iotstudio/iotstudio/internal/models"
	"github.com/iotstudio/iotstudio/internal/parser"
	protocol "github.com/iotstudio/iotstudio/internal/protocols"
	"github.com/iotstudio/iotstudio/internal/protocols/modbus"
	"github.com/iotstudio/iotstudio/internal/storage"
	"github.com/iotstudio/iotstudio/pkg/api"
	"github.com/rs/zerolog/log"
)

const (
	maxRetries          = 3
	defaultRetryDelay   = 2 * time.Second
	maxRetryDelay       = 30 * time.Second
	maxPoolSize         = 100
	maxIdleTime         = 10 * time.Minute
	poolCleanupInterval = 5 * time.Minute
)

type managedConnection struct {
	handler      protocol.ProtocolHandler
	connection   *models.Connection
	parser       *models.Parser
	parserEngine *parser.Engine
	retries      int
	backoff      time.Duration
	lastActive   time.Time
}

type ConnectionManager struct {
	connections     map[string]*managedConnection
	storage         storage.Storage
	parserEngine    *parser.Engine
	protocolFactory map[string]protocol.ProtocolFactory
	mu              sync.RWMutex
	ctx             context.Context
	cancel          context.CancelFunc
}

type Config struct {
	Storage  storage.Storage
	PoolSize int
}

func NewConnectionManager(config Config) *ConnectionManager {
	ctx, cancel := context.WithCancel(context.Background())

	cm := &ConnectionManager{
		connections:     make(map[string]*managedConnection),
		storage:         config.Storage,
		parserEngine:    parser.NewEngine(),
		protocolFactory: make(map[string]protocol.ProtocolFactory),
		ctx:             ctx,
		cancel:          cancel,
	}

	go cm.cleanupRoutine()

	cm.RegisterProtocol("modbus_tcp", func(ctx context.Context, config api.ConnectionConfig) (protocol.ProtocolHandler, error) {
		var modbusConfig api.ModbusTCPConfig
		if err := json.Unmarshal([]byte(config.ConfigJSON), &modbusConfig); err != nil {
			return nil, fmt.Errorf("failed to parse ModbusTCP config: %w", err)
		}
		return modbus.NewModbusTCPHandler(modbus.ModbusTCPConfig{
			Host:    modbusConfig.Host,
			Port:    modbusConfig.Port,
			Timeout: time.Duration(modbusConfig.Timeout) * time.Second,
			Logger:  modbus.NewModbusLogger(log.Logger),
		}), nil
	})

	cm.RegisterProtocol("modbus_rtu", func(ctx context.Context, config api.ConnectionConfig) (protocol.ProtocolHandler, error) {
		var modbusConfig api.ModbusRTUConfig
		if err := json.Unmarshal([]byte(config.ConfigJSON), &modbusConfig); err != nil {
			return nil, fmt.Errorf("failed to parse ModbusRTU config: %w", err)
		}
		return modbus.NewModbusRTUHandler(modbus.ModbusRTUConfig{
			Port:     modbusConfig.Port,
			BaudRate: modbusConfig.BaudRate,
			DataBits: modbusConfig.DataBits,
			Parity:   modbusConfig.Parity,
			StopBits: modbusConfig.StopBits,
			Timeout:  time.Duration(modbusConfig.Timeout) * time.Millisecond,
			Logger:   modbus.NewModbusLogger(log.Logger),
		}), nil
	})

	return cm
}

func (cm *ConnectionManager) RegisterProtocol(protocolType string, factory protocol.ProtocolFactory) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.protocolFactory[protocolType] = factory
	log.Info().Str("protocol", protocolType).Msg("Protocol registered")
}

func (cm *ConnectionManager) CreateConnection(ctx context.Context, conn *models.Connection) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	connID := uuid.New().String()
	conn.ID = connID

	if err := cm.storage.CreateConnection(ctx, conn); err != nil {
		return fmt.Errorf("failed to store connection: %w", err)
	}

	var p *models.Parser
	if conn.ParserID != "" {
		var err error
		p, err = cm.storage.GetParser(ctx, conn.ParserID)
		if err != nil {
			return fmt.Errorf("failed to load parser: %w", err)
		}
	}

	config := api.ConnectionConfig{
		ID:         conn.ID,
		SessionID:  conn.SessionID,
		Type:       api.ConnectionType(conn.Type),
		Name:       conn.Name,
		ConfigJSON: conn.Config,
	}

	handler, err := cm.protocolFactory[conn.Type](ctx, config)
	if err != nil {
		return fmt.Errorf("failed to create protocol handler: %w", err)
	}

	managedConn := &managedConnection{
		handler:      handler,
		connection:   conn,
		parser:       p,
		parserEngine: cm.parserEngine,
		lastActive:   time.Now(),
	}

	cm.connections[connID] = managedConn

	log.Info().Str("connID", connID).Msg("Connection created")

	return nil
}

func (cm *ConnectionManager) StartConnection(ctx context.Context, connID string) error {
	cm.mu.RLock()
	managedConn, exists := cm.connections[connID]
	cm.mu.RUnlock()

	if !exists {
		return fmt.Errorf("connection not found: %s", connID)
	}

	var err error
	for retry := 0; retry < maxRetries; retry++ {
		err = managedConn.handler.Connect(ctx, api.ConnectionConfig{})
		if err == nil {
			managedConn.lastActive = time.Now()
			log.Info().Str("connID", connID).Msg("Connection started")
			return nil
		}

		if retry < maxRetries-1 {
			delay := exponentialBackoff(retry)
			log.Warn().Err(err).Str("connID", connID).
				Dur("delay", delay).Int("retry", retry+1).
				Msg("Connection failed, retrying")
			time.Sleep(delay)
			managedConn.retries++
		}
	}

	return fmt.Errorf("failed to start connection after %d retries: %w", maxRetries, err)
}

func (cm *ConnectionManager) StopConnection(ctx context.Context, connID string) error {
	cm.mu.RLock()
	managedConn, exists := cm.connections[connID]
	cm.mu.RUnlock()

	if !exists {
		return nil
	}

	if err := managedConn.handler.Disconnect(); err != nil {
		log.Error().Str("connID", connID).Err(err).Msg("Error disconnecting")
		return err
	}

	managedConn.lastActive = time.Now()

	log.Info().Str("connID", connID).Msg("Connection stopped")

	return nil
}

func (cm *ConnectionManager) RemoveConnection(ctx context.Context, connID string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	managedConn, exists := cm.connections[connID]
	if !exists {
		return nil
	}

	if err := managedConn.handler.Disconnect(); err != nil {
		log.Error().Str("connID", connID).Err(err).Msg("Error disconnecting")
		return err
	}

	delete(cm.connections, connID)

	if err := cm.storage.DeleteConnection(ctx, connID); err != nil {
		return fmt.Errorf("failed to delete connection from storage: %w", err)
	}

	log.Info().Str("connID", connID).Msg("Connection removed")

	return nil
}

func (cm *ConnectionManager) ReadAndParse(ctx context.Context, connID string) (map[string]map[string]interface{}, error) {
	cm.mu.RLock()
	managedConn, exists := cm.connections[connID]
	cm.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("connection not found: %s", connID)
	}

	data, err := managedConn.handler.Read(ctx)
	if err != nil {
		return nil, err
	}

	managedConn.lastActive = time.Now()

	if managedConn.parser != nil {
		result, err := managedConn.parserEngine.Parse(ctx, managedConn.parser, data)
		if err != nil {
			return nil, err
		}
		return result.DeviceData, nil
	}

	return map[string]map[string]interface{}{
		"raw": {"data": string(data)},
	}, nil
}

func (cm *ConnectionManager) GetConnection(connID string) (protocol.ProtocolHandler, error) {
	cm.mu.RLock()
	managedConn, exists := cm.connections[connID]
	cm.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("connection not found: %s", connID)
	}

	return managedConn.handler, nil
}

func (cm *ConnectionManager) GetMetrics(connID string) (api.ConnectionMetrics, error) {
	cm.mu.RLock()
	managedConn, exists := cm.connections[connID]
	cm.mu.RUnlock()

	if !exists {
		return api.ConnectionMetrics{}, fmt.Errorf("connection not found: %s", connID)
	}

	return managedConn.handler.GetMetrics(), nil
}

func (cm *ConnectionManager) ListConnections() []models.Connection {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	var conns []models.Connection
	for _, mc := range cm.connections {
		conns = append(conns, *mc.connection)
	}

	return conns
}

func (cm *ConnectionManager) cleanupRoutine() {
	ticker := time.NewTicker(poolCleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-cm.ctx.Done():
			return
		case <-ticker.C:
			cm.cleanupIdleConnections()
		}
	}
}

func (cm *ConnectionManager) cleanupIdleConnections() {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	now := time.Now()

	for connID, managedConn := range cm.connections {
		idleTime := now.Sub(managedConn.lastActive)
		if idleTime > maxIdleTime {
			log.Info().Str("connID", connID).Dur("idleTime", idleTime).
				Msg("Cleaning up idle connection")
			managedConn.handler.Disconnect()
			delete(cm.connections, connID)
		}
	}
}

func (cm *ConnectionManager) Close() error {
	cm.cancel()
	cm.mu.Lock()
	defer cm.mu.Unlock()

	var errs []error

	for connID, managedConn := range cm.connections {
		if err := managedConn.handler.Disconnect(); err != nil {
			errs = append(errs, fmt.Errorf("connection '%s': %w", connID, err))
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("errors during shutdown: %v", errs)
	}

	cm.connections = make(map[string]*managedConnection)

	if len(errs) > 0 {
		log.Warn().Msg("All connections closed")
	}

	return nil
}

func exponentialBackoff(retryCount int) time.Duration {
	delay := time.Duration(math.Pow(2, float64(retryCount))) * defaultRetryDelay
	if delay > maxRetryDelay {
		delay = maxRetryDelay
	}
	return delay
}
