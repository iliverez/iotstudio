package modbus

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"net"
	"sync"
	"time"

	"github.com/iotstudio/iotstudio/pkg/api"
	"github.com/rs/zerolog/log"
)

type ModbusTCPConfig struct {
	UseMock    bool
	Host       string
	Port       int
	Timeout    time.Duration
	SlaveID    uint8
	MaxRetries int
	RetryDelay int
	Logger     *ModbusLogger
}

type ModbusTCPHandler struct {
	conn      net.Conn
	mu        sync.RWMutex
	config    ModbusTCPConfig
	metrics   api.ConnectionMetrics
	txCounter uint16
}

func NewModbusTCPHandler(config ModbusTCPConfig) *ModbusTCPHandler {
	return &ModbusTCPHandler{
		config:    config,
		txCounter: 0,
	}
}

func (h *ModbusTCPHandler) Connect(ctx context.Context, config api.ConnectionConfig) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.conn != nil {
		return fmt.Errorf("already connected")
	}

	if h.config.UseMock {
		log.Info().Str("mode", "mock").Msg("Modbus TCP mock connection created")
		return nil
	}

	address := fmt.Sprintf("%s:%d", h.config.Host, h.config.Port)
	timeout := 30 * time.Second
	if h.config.Timeout > 0 {
		timeout = h.config.Timeout
	}

	conn, err := net.DialTimeout("tcp", address, timeout)
	if err != nil {
		return fmt.Errorf("failed to connect to %s: %w", address, err)
	}

	h.conn = conn
	log.Info().Str("address", address).Msg("Modbus TCP connection established")

	return nil
}

func (h *ModbusTCPHandler) Disconnect() error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.conn == nil {
		return nil
	}

	err := h.conn.Close()
	h.conn = nil

	if err != nil {
		return fmt.Errorf("error closing connection: %w", err)
	}

	log.Info().Msg("Modbus TCP connection closed")
	return nil
}

func (h *ModbusTCPHandler) ReadCoils(ctx context.Context, unitID uint8, address, quantity uint16) ([]bool, error) {
	h.txCounter++
	req := ReadCoilsRequest{
		FunctionCode:    0x01,
		StartingAddress: address,
		Quantity:        quantity,
	}
	h.config.Logger.LogRequest(h.txCounter, unitID, req.FunctionCode, address, quantity)

	pdu := make([]byte, 5)
	pdu[0] = req.FunctionCode
	binary.BigEndian.PutUint16(pdu[1:3], req.StartingAddress)
	binary.BigEndian.PutUint16(pdu[3:5], req.Quantity)

	response, err := h.sendRequest(ctx, unitID, pdu)
	if err != nil {
		return nil, err
	}

	if response[0] != 0x01 {
		return nil, fmt.Errorf("unexpected function code: 0x%02x", response[0])
	}

	byteCount := response[1]
	coilStatus := make([]bool, quantity)
	for i := 0; i < int(quantity); i++ {
		byteIdx := i / 8
		bitIdx := uint(i % 8)
		coilStatus[i] = (response[2+byteIdx] & (1 << bitIdx)) != 0
	}

	h.config.Logger.LogResponse(h.txCounter, unitID, response[0], byteCount, response[2:])
	return coilStatus, nil
}

func (h *ModbusTCPHandler) ReadDiscreteInputs(ctx context.Context, unitID uint8, address, quantity uint16) ([]bool, error) {
	h.txCounter++
	req := ReadDiscreteInputsRequest{
		FunctionCode:    0x02,
		StartingAddress: address,
		Quantity:        quantity,
	}
	h.config.Logger.LogRequest(h.txCounter, unitID, req.FunctionCode, address, quantity)

	pdu := make([]byte, 5)
	pdu[0] = req.FunctionCode
	binary.BigEndian.PutUint16(pdu[1:3], req.StartingAddress)
	binary.BigEndian.PutUint16(pdu[3:5], req.Quantity)

	response, err := h.sendRequest(ctx, unitID, pdu)
	if err != nil {
		return nil, err
	}

	if response[0] != 0x02 {
		return nil, fmt.Errorf("unexpected function code: 0x%02x", response[0])
	}

	byteCount := response[1]
	inputStatus := make([]bool, quantity)
	for i := 0; i < int(quantity); i++ {
		byteIdx := i / 8
		bitIdx := uint(i % 8)
		inputStatus[i] = (response[2+byteIdx] & (1 << bitIdx)) != 0
	}

	h.config.Logger.LogResponse(h.txCounter, unitID, response[0], byteCount, response[2:])
	return inputStatus, nil
}

func (h *ModbusTCPHandler) ReadHoldingRegisters(ctx context.Context, unitID uint8, address, quantity uint16) ([]uint16, error) {
	h.txCounter++
	req := ReadHoldingRegistersRequest{
		FunctionCode:    0x03,
		StartingAddress: address,
		Quantity:        quantity,
	}
	h.config.Logger.LogRequest(h.txCounter, unitID, req.FunctionCode, address, quantity)

	pdu := make([]byte, 5)
	pdu[0] = req.FunctionCode
	binary.BigEndian.PutUint16(pdu[1:3], req.StartingAddress)
	binary.BigEndian.PutUint16(pdu[3:5], req.Quantity)

	response, err := h.sendRequest(ctx, unitID, pdu)
	if err != nil {
		return nil, err
	}

	if response[0] != 0x03 {
		return nil, fmt.Errorf("unexpected function code: 0x%02x", response[0])
	}

	byteCount := response[1]
	registerValues := make([]uint16, quantity)
	for i := 0; i < int(quantity); i++ {
		registerValues[i] = binary.BigEndian.Uint16(response[2+i*2 : 4+i*2])
	}

	h.config.Logger.LogResponse(h.txCounter, unitID, response[0], byteCount, response[2:])
	return registerValues, nil
}

func (h *ModbusTCPHandler) ReadInputRegisters(ctx context.Context, unitID uint8, address, quantity uint16) ([]uint16, error) {
	h.txCounter++
	req := ReadInputRegistersRequest{
		FunctionCode:    0x04,
		StartingAddress: address,
		Quantity:        quantity,
	}
	h.config.Logger.LogRequest(h.txCounter, unitID, req.FunctionCode, address, quantity)

	pdu := make([]byte, 5)
	pdu[0] = req.FunctionCode
	binary.BigEndian.PutUint16(pdu[1:3], req.StartingAddress)
	binary.BigEndian.PutUint16(pdu[3:5], req.Quantity)

	response, err := h.sendRequest(ctx, unitID, pdu)
	if err != nil {
		return nil, err
	}

	if response[0] != 0x04 {
		return nil, fmt.Errorf("unexpected function code: 0x%02x", response[0])
	}

	byteCount := response[1]
	registerValues := make([]uint16, quantity)
	for i := 0; i < int(quantity); i++ {
		registerValues[i] = binary.BigEndian.Uint16(response[2+i*2 : 4+i*2])
	}

	h.config.Logger.LogResponse(h.txCounter, unitID, response[0], byteCount, response[2:])
	return registerValues, nil
}

func (h *ModbusTCPHandler) WriteSingleCoil(ctx context.Context, unitID uint8, address uint16, outputValue bool) error {
	h.txCounter++
	value := uint16(0)
	if outputValue {
		value = 0xFF00
	}

	req := WriteSingleCoilRequest{
		FunctionCode:  0x05,
		OutputAddress: address,
		OutputValue:   value,
	}
	h.config.Logger.LogRequest(h.txCounter, unitID, req.FunctionCode, address, 1)

	pdu := make([]byte, 5)
	pdu[0] = req.FunctionCode
	binary.BigEndian.PutUint16(pdu[1:3], req.OutputAddress)
	binary.BigEndian.PutUint16(pdu[3:5], req.OutputValue)

	response, err := h.sendRequest(ctx, unitID, pdu)
	if err != nil {
		return err
	}

	if response[0] != 0x05 {
		return fmt.Errorf("unexpected function code: 0x%02x", response[0])
	}

	if len(response) < 5 {
		return fmt.Errorf("invalid response length: %d", len(response))
	}

	respValue := binary.BigEndian.Uint16(response[1:5])
	if respValue != value {
		return fmt.Errorf("coil value mismatch: expected %04x, got %04x", value, respValue)
	}

	h.config.Logger.LogResponse(h.txCounter, unitID, response[0], uint8(len(response)), response[1:])
	return nil
}

func (h *ModbusTCPHandler) WriteSingleRegister(ctx context.Context, unitID uint8, address, value uint16) error {
	h.txCounter++
	req := WriteSingleRegisterRequest{
		FunctionCode:    0x06,
		RegisterAddress: address,
		RegisterValue:   value,
	}
	h.config.Logger.LogRequest(h.txCounter, unitID, req.FunctionCode, address, 1)

	pdu := make([]byte, 5)
	pdu[0] = req.FunctionCode
	binary.BigEndian.PutUint16(pdu[1:3], req.RegisterAddress)
	binary.BigEndian.PutUint16(pdu[3:5], req.RegisterValue)

	response, err := h.sendRequest(ctx, unitID, pdu)
	if err != nil {
		return err
	}

	if response[0] != 0x06 {
		return fmt.Errorf("unexpected function code: 0x%02x", response[0])
	}

	if len(response) < 5 {
		return fmt.Errorf("invalid response length: %d", len(response))
	}

	respValue := binary.BigEndian.Uint16(response[1:5])
	if respValue != value {
		return fmt.Errorf("register value mismatch: expected %04x, got %04x", value, respValue)
	}

	h.config.Logger.LogResponse(h.txCounter, unitID, response[0], uint8(len(response)), response[1:])
	return nil
}

func (h *ModbusTCPHandler) WriteMultipleCoils(ctx context.Context, unitID uint8, address uint16, values []bool) error {
	h.txCounter++
	quantity := uint16(len(values))

	outputBytes := make([]byte, (quantity+7)/8)
	for i, val := range values {
		if val {
			outputBytes[i/8] |= 1 << (uint(i) % 8)
		}
	}

	req := WriteMultipleCoilsRequest{
		FunctionCode:    0x0F,
		StartingAddress: address,
		Quantity:        quantity,
		OutputValues:    outputBytes[:(quantity+7)/8],
	}
	h.config.Logger.LogRequest(h.txCounter, unitID, req.FunctionCode, address, quantity)

	pdu := make([]byte, 6+len(req.OutputValues))
	pdu[0] = req.FunctionCode
	binary.BigEndian.PutUint16(pdu[1:3], req.StartingAddress)
	binary.BigEndian.PutUint16(pdu[3:5], req.Quantity)
	pdu[5] = uint8(len(req.OutputValues))
	copy(pdu[6:], req.OutputValues)

	response, err := h.sendRequest(ctx, unitID, pdu)
	if err != nil {
		return err
	}

	if response[0] != 0x0F {
		return fmt.Errorf("unexpected function code: 0x%02x", response[0])
	}

	h.config.Logger.LogResponse(h.txCounter, unitID, response[0], uint8(len(response)), response[1:])
	return nil
}

func (h *ModbusTCPHandler) WriteMultipleRegisters(ctx context.Context, unitID uint8, address uint16, values []uint16) error {
	h.txCounter++
	quantity := uint16(len(values))

	req := WriteMultipleRegistersRequest{
		FunctionCode:    0x10,
		StartingAddress: address,
		RegisterValues:  values,
	}
	h.config.Logger.LogRequest(h.txCounter, unitID, req.FunctionCode, address, quantity)

	pdu := make([]byte, 5+len(values)*2)
	pdu[0] = req.FunctionCode
	binary.BigEndian.PutUint16(pdu[1:3], req.StartingAddress)
	binary.BigEndian.PutUint16(pdu[3:5], quantity)
	pdu[5] = uint8(len(values) * 2)

	for i, val := range values {
		binary.BigEndian.PutUint16(pdu[6+i*2:8+i*2], val)
	}

	response, err := h.sendRequest(ctx, unitID, pdu)
	if err != nil {
		return err
	}

	if response[0] != 0x10 {
		return fmt.Errorf("unexpected function code: 0x%02x", response[0])
	}

	h.config.Logger.LogResponse(h.txCounter, unitID, response[0], uint8(len(response)), response[1:])
	return nil
}

func (h *ModbusTCPHandler) ReadWriteMultipleRegisters(ctx context.Context, unitID uint8, readStartAddr, writeStartAddr uint16, writeValues []uint16) ([]uint16, error) {
	h.txCounter++

	req := ReadWriteMultipleRegistersRequest{
		FunctionCode:      0x17,
		ReadStartAddress:  readStartAddr,
		ReadWriteCount:    uint16(len(writeValues)),
		WriteStartAddress: writeStartAddr,
		RegisterValues:    writeValues,
	}
	h.config.Logger.LogRequest(h.txCounter, unitID, req.FunctionCode, readStartAddr, req.ReadWriteCount)

	pdu := make([]byte, 10+len(writeValues)*2)
	pdu[0] = req.FunctionCode
	binary.BigEndian.PutUint16(pdu[1:3], req.ReadStartAddress)
	binary.BigEndian.PutUint16(pdu[3:5], req.ReadWriteCount)
	binary.BigEndian.PutUint16(pdu[5:7], req.WriteStartAddress)
	binary.BigEndian.PutUint16(pdu[7:9], req.ReadWriteCount)
	pdu[9] = uint8(len(writeValues) * 2)

	for i, val := range writeValues {
		binary.BigEndian.PutUint16(pdu[10+i*2:12+i*2], val)
	}

	response, err := h.sendRequest(ctx, unitID, pdu)
	if err != nil {
		return nil, err
	}

	if response[0] != 0x17 {
		return nil, fmt.Errorf("unexpected function code: 0x%02x", response[0])
	}

	byteCount := response[1]
	registerValues := make([]uint16, byteCount/2)
	for i := 0; i < len(registerValues); i++ {
		registerValues[i] = binary.BigEndian.Uint16(response[2+i*2 : 4+i*2])
	}

	h.config.Logger.LogResponse(h.txCounter, unitID, response[0], byteCount, response[2:])
	return registerValues, nil
}

func (h *ModbusTCPHandler) MaskWriteRegister(ctx context.Context, unitID uint8, address, andMask, orMask uint16) error {
	h.txCounter++

	req := MaskWriteRegisterRequest{
		FunctionCode:    0x16,
		RegisterAddress: address,
		AndMask:         andMask,
		OrMask:          orMask,
	}
	h.config.Logger.LogRequest(h.txCounter, unitID, req.FunctionCode, address, 1)

	pdu := make([]byte, 7)
	pdu[0] = req.FunctionCode
	binary.BigEndian.PutUint16(pdu[1:3], req.RegisterAddress)
	binary.BigEndian.PutUint16(pdu[3:5], req.AndMask)
	binary.BigEndian.PutUint16(pdu[5:7], req.OrMask)

	response, err := h.sendRequest(ctx, unitID, pdu)
	if err != nil {
		return err
	}

	if response[0] != 0x16 {
		return fmt.Errorf("unexpected function code: 0x%02x", response[0])
	}

	if len(response) < 7 {
		return fmt.Errorf("invalid response length: %d", len(response))
	}

	respAddress := binary.BigEndian.Uint16(response[1:3])
	respAndMask := binary.BigEndian.Uint16(response[3:5])
	respOrMask := binary.BigEndian.Uint16(response[5:7])

	if respAddress != address || respAndMask != andMask || respOrMask != orMask {
		return fmt.Errorf("register mask mismatch")
	}

	h.config.Logger.LogResponse(h.txCounter, unitID, response[0], uint8(len(response)), response[1:])
	return nil
}

func (h *ModbusTCPHandler) sendRequest(ctx context.Context, unitID uint8, pdu []byte) ([]byte, error) {
	if h.config.UseMock {
		return h.mockSendRequest(pdu)
	}

	if h.conn == nil {
		return nil, ErrNotConnected
	}

	mbap := buildMBAP(h.txCounter, uint8(len(pdu)), unitID)
	frame := append(mbap, pdu...)

	timeout := 30 * time.Second
	if h.config.Timeout > 0 {
		timeout = h.config.Timeout
	}

	h.conn.SetDeadline(time.Now().Add(timeout))
	_, err := h.conn.Write(frame)
	if err != nil {
		h.metrics.ErrorCount++
		return nil, fmt.Errorf("failed to write request: %w", err)
	}

	h.metrics.BytesWritten += int64(len(frame))
	h.metrics.WriteCount++
	h.metrics.LastWrite = time.Now()

	response, err := h.readResponse(ctx)
	if err != nil {
		return nil, err
	}

	return response, nil
}

func (h *ModbusTCPHandler) readResponse(ctx context.Context) ([]byte, error) {
	response := make([]byte, 256)

	mbap := make([]byte, 7)
	_, err := h.conn.Read(mbap)
	if err != nil {
		return nil, fmt.Errorf("failed to read MBAP header: %w", err)
	}

	if mbap[0] != byte(h.txCounter>>8) || mbap[1] != byte(h.txCounter&0xFF) {
		return nil, fmt.Errorf("transaction ID mismatch")
	}

	length := binary.BigEndian.Uint16(mbap[4:6])
	pduLength := int(length - 1)

	if pduLength > 256 {
		return nil, fmt.Errorf("PDU length too large: %d", pduLength)
	}

	totalRead := 0
	for totalRead < pduLength {
		n, err := h.conn.Read(response[totalRead:pduLength])
		if err != nil {
			return nil, fmt.Errorf("failed to read PDU: %w", err)
		}
		totalRead += n
	}

	h.metrics.BytesRead += int64(7 + totalRead)
	h.metrics.ReadCount++
	h.metrics.LastRead = time.Now()

	return response[:totalRead], nil
}

func (h *ModbusTCPHandler) mockSendRequest(pdu []byte) ([]byte, error) {
	if len(pdu) < 1 {
		return nil, fmt.Errorf("invalid PDU length")
	}

	funcCode := pdu[0]
	response := []byte{funcCode}

	if funcCode == 0x01 || funcCode == 0x02 {
		response = append(response, 1, 0xFF)
	} else if funcCode == 0x03 || funcCode == 0x04 {
		quantity := binary.BigEndian.Uint16(pdu[3:5])
		byteCount := quantity * 2
		response = append(response, uint8(byteCount))
		for i := 0; i < int(byteCount); i++ {
			response = append(response, 0x00, 0x00)
		}
	} else if funcCode == 0x05 || funcCode == 0x06 {
		response = append(response, pdu[1], pdu[2], pdu[3], pdu[4])
	} else if funcCode == 0x0F {
		response = append(response, pdu[1], pdu[2], pdu[3])
	} else if funcCode == 0x10 {
		response = append(response, pdu[1], pdu[2], pdu[3])
	} else if funcCode == 0x16 {
		response = append(response, pdu[1], pdu[2], pdu[3], pdu[4], pdu[5], pdu[6])
	} else if funcCode == 0x17 {
		response = append(response, pdu[5]*2)
		for i := 0; i < int(pdu[5]*2); i++ {
			response = append(response, 0x00, 0x00)
		}
	}

	return response, nil
}

func (h *ModbusTCPHandler) Read(ctx context.Context) ([]byte, error) {
	if h.conn == nil {
		return nil, ErrNotConnected
	}

	data := make([]byte, 256)
	n, err := h.conn.Read(data)
	if err != nil {
		return nil, fmt.Errorf("failed to read: %w", err)
	}

	h.metrics.BytesRead += int64(n)
	h.metrics.ReadCount++
	h.metrics.LastRead = time.Now()

	return data[:n], nil
}

func (h *ModbusTCPHandler) Write(ctx context.Context, data []byte) error {
	if len(data) == 0 {
		return errors.New("cannot write empty data")
	}

	if h.conn == nil {
		return ErrNotConnected
	}

	n, err := h.conn.Write(data)
	if err != nil {
		return fmt.Errorf("failed to write: %w", err)
	}

	h.metrics.BytesWritten += int64(n)
	h.metrics.WriteCount++
	h.metrics.LastWrite = time.Now()

	return nil
}

func (h *ModbusTCPHandler) IsConnected() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.conn != nil || h.config.UseMock
}

func (h *ModbusTCPHandler) GetMetrics() api.ConnectionMetrics {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.metrics
}

func buildMBAP(txID uint16, length uint8, unitID uint8) []byte {
	mbap := make([]byte, 7)
	binary.BigEndian.PutUint16(mbap[0:2], txID)
	binary.BigEndian.PutUint16(mbap[2:4], 0)
	binary.BigEndian.PutUint16(mbap[4:6], uint16(length)+1)
	mbap[6] = unitID
	return mbap
}
