package connections

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
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

// LoadConnection loads a connection from storage into memory for management
func (cm *ConnectionManager) LoadConnection(ctx context.Context, connID string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	// Check if already loaded
	if _, exists := cm.connections[connID]; exists {
		return nil
	}

	// Load from storage
	conn, err := cm.storage.GetConnection(ctx, connID)
	if err != nil {
		return fmt.Errorf("connection not found: %s", connID)
	}

	var p *models.Parser
	if conn.ParserID != "" {
		p, err = cm.storage.GetParser(ctx, conn.ParserID)
		if err != nil {
			log.Warn().Err(err).Str("parserID", conn.ParserID).Msg("Failed to load parser for connection")
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

	log.Info().Str("connID", connID).Msg("Connection loaded into manager")

	return nil
}

func (cm *ConnectionManager) StartConnection(ctx context.Context, connID string) error {
	// First, ensure the connection is loaded
	if err := cm.LoadConnection(ctx, connID); err != nil {
		return err
	}

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

func (cm *ConnectionManager) ReadAndParse(ctx context.Context, connID string, parserID string) (map[string]map[string]interface{}, error) {
	// First, ensure the connection is loaded
	if err := cm.LoadConnection(ctx, connID); err != nil {
		return nil, err
	}

	cm.mu.RLock()
	managedConn, exists := cm.connections[connID]
	cm.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("connection not found: %s", connID)
	}

	// Load parser if parserID is provided (device-level parser takes precedence)
	if parserID != "" {
		parser, err := cm.storage.GetParser(ctx, parserID)
		if err != nil {
			log.Warn().Err(err).Str("parserID", parserID).Msg("Failed to load device parser")
		} else {
			managedConn.parser = parser
			log.Debug().Str("parserID", parserID).Int("modbusRegistersCount", len(parser.ModbusRegisters)).Msg("Loaded device parser")
		}
	}

	// Check if the handler is actually connected, if not try to connect
	if !managedConn.handler.IsConnected() {
		log.Info().Str("connID", connID).Msg("Handler not connected, attempting to connect")

		config := api.ConnectionConfig{
			ID:         managedConn.connection.ID,
			SessionID:  managedConn.connection.SessionID,
			Type:       api.ConnectionType(managedConn.connection.Type),
			Name:       managedConn.connection.Name,
			ConfigJSON: managedConn.connection.Config,
		}

		if err := managedConn.handler.Connect(ctx, config); err != nil {
			return nil, fmt.Errorf("failed to connect: %w", err)
		}
	}

	// Debug log parser state
	log.Debug().
		Str("connID", connID).
		Bool("hasParser", managedConn.parser != nil).
		Int("modbusRegistersCount", func() int {
			if managedConn.parser != nil {
				return len(managedConn.parser.ModbusRegisters)
			}
			return 0
		}()).
		Str("parserID", func() string {
			if managedConn.parser != nil {
				return managedConn.parser.ID
			}
			return ""
		}()).
		Msg("Parser state check")

	// Check if this is a Modbus connection with ModbusRegisters in parser
	if managedConn.parser != nil && len(managedConn.parser.ModbusRegisters) > 0 {
		return cm.readModbusRegisters(ctx, managedConn)
	}

	// For non-Modbus connections, use the standard Read method
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

// readModbusRegisters reads data from Modbus registers based on parser configuration
func (cm *ConnectionManager) readModbusRegisters(ctx context.Context, managedConn *managedConnection) (map[string]map[string]interface{}, error) {
	modbusHandler, ok := managedConn.handler.(*modbus.ModbusTCPHandler)
	if !ok {
		return nil, fmt.Errorf("connection is not a Modbus TCP handler")
	}

	// Ensure the handler is connected before reading
	if !modbusHandler.IsConnected() {
		log.Info().Str("connID", managedConn.connection.ID).Msg("Modbus handler not connected, attempting to connect")

		config := api.ConnectionConfig{
			ID:         managedConn.connection.ID,
			SessionID:  managedConn.connection.SessionID,
			Type:       api.ConnectionType(managedConn.connection.Type),
			Name:       managedConn.connection.Name,
			ConfigJSON: managedConn.connection.Config,
		}

		if err := modbusHandler.Connect(ctx, config); err != nil {
			return nil, fmt.Errorf("failed to connect Modbus handler: %w", err)
		}
	}

	// Parse connection config to get slave ID
	var connConfig struct {
		SlaveID uint8 `json:"slaveId"`
	}
	if managedConn.connection.Config != "" {
		if err := json.Unmarshal([]byte(managedConn.connection.Config), &connConfig); err != nil {
			connConfig.SlaveID = 1 // Default slave ID
		}
	}
	if connConfig.SlaveID == 0 {
		connConfig.SlaveID = 1
	}

	result := make(map[string]map[string]interface{})
	deviceData := make(map[string]interface{})

	for _, reg := range managedConn.parser.ModbusRegisters {
		// Try to read with one retry on connection error
		value, err := cm.readModbusRegister(ctx, modbusHandler, connConfig.SlaveID, reg)
		if err != nil {
			// Check if it's a connection error, try to reconnect and retry once
			if err == modbus.ErrNotConnected || strings.Contains(err.Error(), "not connected") ||
				strings.Contains(err.Error(), "broken pipe") || strings.Contains(err.Error(), "connection reset") ||
				strings.Contains(err.Error(), "EOF") {
				log.Warn().Err(err).Str("connID", managedConn.connection.ID).Msg("Connection error, attempting reconnect")

				// Reconnect
				config := api.ConnectionConfig{
					ID:         managedConn.connection.ID,
					SessionID:  managedConn.connection.SessionID,
					Type:       api.ConnectionType(managedConn.connection.Type),
					Name:       managedConn.connection.Name,
					ConfigJSON: managedConn.connection.Config,
				}

				if reconnectErr := modbusHandler.Connect(ctx, config); reconnectErr != nil {
					deviceData[reg.Name] = map[string]interface{}{
						"error": fmt.Sprintf("reconnect failed: %s", reconnectErr.Error()),
					}
					continue
				}

				// Retry read
				value, err = cm.readModbusRegister(ctx, modbusHandler, connConfig.SlaveID, reg)
				if err != nil {
					log.Error().Err(err).Str("register", reg.Name).Msg("Failed to read Modbus register after reconnect")
					deviceData[reg.Name] = map[string]interface{}{
						"error": err.Error(),
					}
					continue
				}
			} else {
				log.Error().Err(err).Str("register", reg.Name).Msg("Failed to read Modbus register")
				deviceData[reg.Name] = map[string]interface{}{
					"error": err.Error(),
				}
				continue
			}
		}
		deviceData[reg.Name] = value
	}

	// Use parser ID as device key, or "device" if not available
	deviceKey := "device"
	if managedConn.parser.ID != "" {
		deviceKey = managedConn.parser.ID
	}
	result[deviceKey] = deviceData

	managedConn.lastActive = time.Now()
	return result, nil
}

// readModbusRegister reads a single Modbus register and returns the parsed value
func (cm *ConnectionManager) readModbusRegister(ctx context.Context, handler *modbus.ModbusTCPHandler, slaveID uint8, reg models.ModbusRegister) (interface{}, error) {
	switch reg.RegisterType {
	case "holding_register":
		values, err := handler.ReadHoldingRegisters(ctx, slaveID, reg.Address, reg.Quantity)
		if err != nil {
			return nil, fmt.Errorf("failed to read holding registers: %w", err)
		}
		return cm.parseModbusValues(values, reg)

	case "input_register":
		values, err := handler.ReadInputRegisters(ctx, slaveID, reg.Address, reg.Quantity)
		if err != nil {
			return nil, fmt.Errorf("failed to read input registers: %w", err)
		}
		return cm.parseModbusValues(values, reg)

	case "coil":
		values, err := handler.ReadCoils(ctx, slaveID, reg.Address, reg.Quantity)
		if err != nil {
			return nil, fmt.Errorf("failed to read coils: %w", err)
		}
		return values, nil

	case "discrete_input":
		values, err := handler.ReadDiscreteInputs(ctx, slaveID, reg.Address, reg.Quantity)
		if err != nil {
			return nil, fmt.Errorf("failed to read discrete inputs: %w", err)
		}
		return values, nil

	default:
		return nil, fmt.Errorf("unknown register type: %s", reg.RegisterType)
	}
}

// parseModbusValues converts raw register values to the specified data type
func (cm *ConnectionManager) parseModbusValues(values []uint16, reg models.ModbusRegister) (interface{}, error) {
	if len(values) == 0 {
		return nil, fmt.Errorf("no values read from register")
	}

	scale := reg.Scale
	if scale == 0 {
		scale = 1.0
	}
	offset := reg.Offset

	switch reg.DataType {
	case "uint16":
		return float64(values[0])*scale + offset, nil

	case "int16":
		val := int16(values[0])
		return float64(val)*scale + offset, nil

	case "uint32":
		if len(values) < 2 {
			return nil, fmt.Errorf("need 2 registers for uint32")
		}
		var val uint32
		if reg.Endianness == "little" {
			val = uint32(values[0]) | (uint32(values[1]) << 16)
		} else {
			val = (uint32(values[0]) << 16) | uint32(values[1])
		}
		return float64(val)*scale + offset, nil

	case "int32":
		if len(values) < 2 {
			return nil, fmt.Errorf("need 2 registers for int32")
		}
		var val uint32
		if reg.Endianness == "little" {
			val = uint32(values[0]) | (uint32(values[1]) << 16)
		} else {
			val = (uint32(values[0]) << 16) | uint32(values[1])
		}
		return float64(int32(val))*scale + offset, nil

	case "float32":
		if len(values) < 2 {
			return nil, fmt.Errorf("need 2 registers for float32")
		}
		var bits uint32
		if reg.Endianness == "little" {
			bits = uint32(values[0]) | (uint32(values[1]) << 16)
		} else {
			bits = (uint32(values[0]) << 16) | uint32(values[1])
		}
		val := math.Float32frombits(bits)
		return float64(val)*scale + offset, nil

	case "float64":
		if len(values) < 4 {
			return nil, fmt.Errorf("need 4 registers for float64")
		}
		var bits uint64
		if reg.Endianness == "little" {
			bits = uint64(values[0]) | (uint64(values[1]) << 16) | (uint64(values[2]) << 32) | (uint64(values[3]) << 48)
		} else {
			bits = (uint64(values[0]) << 48) | (uint64(values[1]) << 32) | (uint64(values[2]) << 16) | uint64(values[3])
		}
		val := math.Float64frombits(bits)
		return val*scale + offset, nil

	default:
		// Return raw values if data type not specified
		return values, nil
	}
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
