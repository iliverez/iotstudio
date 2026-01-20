package modbus

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/iotstudio/iotstudio/pkg/api"
	"github.com/rs/zerolog/log"
	"go.bug.st/serial"
)

const (
	t1_5 = time.Microsecond * 1750
	t3_5 = time.Microsecond * 1750 * 3
)

type ModbusRTUConfig struct {
	UseMock    bool
	Port       string
	BaudRate   int
	DataBits   int
	Parity     string
	StopBits   int
	Timeout    time.Duration
	SlaveID    uint8
	MaxRetries int
	RetryDelay int
	Logger     *ModbusLogger
}

type ModbusRTUHandler struct {
	port      serial.Port
	mu        sync.RWMutex
	config    ModbusRTUConfig
	metrics   api.ConnectionMetrics
	txCounter uint16
}

func NewModbusRTUHandler(config ModbusRTUConfig) *ModbusRTUHandler {
	return &ModbusRTUHandler{
		config:    config,
		txCounter: 0,
	}
}

func (h *ModbusRTUHandler) Connect(ctx context.Context, config api.ConnectionConfig) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.config.UseMock {
		mockPort := &mockSerialPort{}
		h.port = mockPort
		log.Info().Str("mode", "mock").Msg("Modbus RTU mock port created")
		return nil
	}

	baudRate := h.config.BaudRate
	if baudRate == 0 {
		baudRate = 9600
	}

	dataBits := h.config.DataBits
	if dataBits == 0 {
		dataBits = 8
	}

	var parity serial.Parity
	switch h.config.Parity {
	case "N":
		parity = serial.NoParity
	case "O":
		parity = serial.OddParity
	case "E":
		parity = serial.EvenParity
	case "M":
		parity = serial.MarkParity
	case "S":
		parity = serial.SpaceParity
	default:
		parity = serial.NoParity
	}

	var stopBits serial.StopBits
	if h.config.StopBits == 2 {
		stopBits = serial.TwoStopBits
	} else {
		stopBits = serial.OneStopBit
	}

	mode := &serial.Mode{
		BaudRate: baudRate,
		DataBits: dataBits,
		Parity:   parity,
		StopBits: stopBits,
	}

	port, err := serial.Open(h.config.Port, mode)
	if err != nil {
		return fmt.Errorf("failed to open serial port %s: %w", h.config.Port, err)
	}

	h.port = port
	log.Info().Str("port", h.config.Port).
		Str("baud", fmt.Sprintf("%d", baudRate)).
		Msg("Modbus RTU connection established")

	return nil
}

func (h *ModbusRTUHandler) Disconnect() error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.port == nil {
		return nil
	}

	err := h.port.Close()
	h.port = nil

	if err != nil {
		portErr, ok := err.(*serial.PortError)
		if ok && portErr.Code() == serial.PortClosed {
			return nil
		}
		return err
	}

	log.Info().Msg("Modbus RTU connection closed")
	return nil
}

func (h *ModbusRTUHandler) ReadCoils(ctx context.Context, unitID uint8, address, quantity uint16) ([]bool, error) {
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

	frame := buildRTUFrame(unitID, pdu)
	response, err := h.sendRequest(ctx, frame)
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

func (h *ModbusRTUHandler) ReadDiscreteInputs(ctx context.Context, unitID uint8, address, quantity uint16) ([]bool, error) {
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

	frame := buildRTUFrame(unitID, pdu)
	response, err := h.sendRequest(ctx, frame)
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

func (h *ModbusRTUHandler) ReadHoldingRegisters(ctx context.Context, unitID uint8, address, quantity uint16) ([]uint16, error) {
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

	frame := buildRTUFrame(unitID, pdu)
	response, err := h.sendRequest(ctx, frame)
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

func (h *ModbusRTUHandler) ReadInputRegisters(ctx context.Context, unitID uint8, address, quantity uint16) ([]uint16, error) {
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

	frame := buildRTUFrame(unitID, pdu)
	response, err := h.sendRequest(ctx, frame)
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

func (h *ModbusRTUHandler) WriteSingleCoil(ctx context.Context, unitID uint8, address uint16, outputValue bool) error {
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

	frame := buildRTUFrame(unitID, pdu)
	response, err := h.sendRequest(ctx, frame)
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

func (h *ModbusRTUHandler) WriteSingleRegister(ctx context.Context, unitID uint8, address, value uint16) error {
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

	frame := buildRTUFrame(unitID, pdu)
	response, err := h.sendRequest(ctx, frame)
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

func (h *ModbusRTUHandler) WriteMultipleCoils(ctx context.Context, unitID uint8, address uint16, values []bool) error {
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

	frame := buildRTUFrame(unitID, pdu)
	response, err := h.sendRequest(ctx, frame)
	if err != nil {
		return err
	}

	if response[0] != 0x0F {
		return fmt.Errorf("unexpected function code: 0x%02x", response[0])
	}

	h.config.Logger.LogResponse(h.txCounter, unitID, response[0], uint8(len(response)), response[1:])
	return nil
}

func (h *ModbusRTUHandler) WriteMultipleRegisters(ctx context.Context, unitID uint8, address uint16, values []uint16) error {
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

	frame := buildRTUFrame(unitID, pdu)
	response, err := h.sendRequest(ctx, frame)
	if err != nil {
		return err
	}

	if response[0] != 0x10 {
		return fmt.Errorf("unexpected function code: 0x%02x", response[0])
	}

	h.config.Logger.LogResponse(h.txCounter, unitID, response[0], uint8(len(response)), response[1:])
	return nil
}

func (h *ModbusRTUHandler) ReadWriteMultipleRegisters(ctx context.Context, unitID uint8, readStartAddr, writeStartAddr uint16, writeValues []uint16) ([]uint16, error) {
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

	frame := buildRTUFrame(unitID, pdu)
	response, err := h.sendRequest(ctx, frame)
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

func (h *ModbusRTUHandler) MaskWriteRegister(ctx context.Context, unitID uint8, address, andMask, orMask uint16) error {
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

	frame := buildRTUFrame(unitID, pdu)
	response, err := h.sendRequest(ctx, frame)
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

func (h *ModbusRTUHandler) sendRequest(ctx context.Context, frame []byte) ([]byte, error) {
	if h.port == nil {
		return nil, ErrNotConnected
	}

	_, err := h.port.Write(frame)
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

	if len(response) < 3 {
		return nil, fmt.Errorf("invalid response length: %d", len(response))
	}

	crc := binary.LittleEndian.Uint16(response[len(response)-2:])
	dataWithoutCRC := response[:len(response)-2]

	if !ValidateCRC(dataWithoutCRC, crc) {
		h.config.Logger.LogException(h.txCounter, ExceptionIllegalDataValue, "CRC validation failed")
		return nil, fmt.Errorf("%w: CRC mismatch", ErrException)
	}

	return dataWithoutCRC, nil
}

func (h *ModbusRTUHandler) readResponse(ctx context.Context) ([]byte, error) {
	response := make([]byte, 256)

	totalRead := 0
	deadline := time.Now().Add(h.config.Timeout)

	for {
		if time.Now().After(deadline) {
			return nil, ErrTimeout
		}

		n, err := h.port.Read(response[totalRead:])
		if err != nil {
			return nil, fmt.Errorf("failed to read response: %w", err)
		}
		if n == 0 {
			time.Sleep(1 * time.Millisecond)
			continue
		}

		totalRead += n

		if totalRead >= 3 {
			expectedLength := int(response[1]) + 3
			if totalRead >= expectedLength {
				break
			}
		}
	}

	return response[:totalRead], nil
}

func (h *ModbusRTUHandler) Read(ctx context.Context) ([]byte, error) {
	if h.port == nil {
		return nil, ErrNotConnected
	}

	data := make([]byte, 256)
	n, err := h.port.Read(data)
	if err != nil {
		return nil, fmt.Errorf("failed to read: %w", err)
	}

	h.metrics.BytesRead += int64(n)
	h.metrics.ReadCount++
	h.metrics.LastRead = time.Now()

	return data[:n], nil
}

func (h *ModbusRTUHandler) Write(ctx context.Context, data []byte) error {
	if len(data) == 0 {
		return errors.New("cannot write empty data")
	}

	if h.port == nil {
		return ErrNotConnected
	}

	n, err := h.port.Write(data)
	if err != nil {
		return fmt.Errorf("failed to write: %w", err)
	}

	h.metrics.BytesWritten += int64(n)
	h.metrics.WriteCount++
	h.metrics.LastWrite = time.Now()

	return nil
}

func (h *ModbusRTUHandler) IsConnected() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.port != nil
}

func (h *ModbusRTUHandler) GetMetrics() api.ConnectionMetrics {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.metrics
}

func buildRTUFrame(unitID uint8, pdu []byte) []byte {
	frame := make([]byte, 1+len(pdu)+2)
	frame[0] = unitID
	copy(frame[1:], pdu)
	crc := CalculateCRC16(frame[:1+len(pdu)])
	binary.LittleEndian.PutUint16(frame[1+len(pdu):], crc)
	return frame
}

type mockSerialPort struct {
	data   []byte
	buffer []byte
	closed bool
	mu     sync.Mutex
}

func (m *mockSerialPort) Read(p []byte) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.closed {
		return 0, errors.New("port closed")
	}

	if len(m.buffer) == 0 {
		return 0, nil
	}

	n := copy(p, m.buffer)
	m.buffer = m.buffer[n:]
	return n, nil
}

func (m *mockSerialPort) Write(p []byte) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.closed {
		return 0, errors.New("port closed")
	}

	m.data = append(m.data, p...)

	if len(p) > 6 && p[0] != 0x15 && p[0] != 0x16 && p[0] != 0x17 {
		funcCode := p[1]
		response := []byte{p[0], funcCode}

		if funcCode == 0x01 || funcCode == 0x02 {
			response = append(response, 1, 0xFF)
		} else if funcCode == 0x03 || funcCode == 0x04 {
			quantity := binary.BigEndian.Uint16(p[3:5])
			byteCount := quantity * 2
			response = append(response, uint8(byteCount))
			for i := 0; i < int(byteCount); i++ {
				response = append(response, 0x00, 0x00)
			}
		} else if funcCode == 0x05 || funcCode == 0x06 {
			response = append(response, p[1], p[2], p[3], p[4])
		} else if funcCode == 0x0F {
			response = append(response, p[1], p[2], p[3])
		} else if funcCode == 0x10 {
			response = append(response, p[1], p[2], p[3])
		}

		crc := CalculateCRC16(response)
		response = append(response, byte(crc&0xFF), byte(crc>>8))
		m.buffer = append(m.buffer, response...)
	}

	return len(p), nil
}

func (m *mockSerialPort) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.closed = true
	return nil
}

func (m *mockSerialPort) SetMode(mode *serial.Mode) error {
	return nil
}

func (m *mockSerialPort) ResetInputBuffer() error {
	return nil
}

func (m *mockSerialPort) ResetOutputBuffer() error {
	return nil
}

func (m *mockSerialPort) SetDTR(dtr bool) error {
	return nil
}

func (m *mockSerialPort) SetRTS(rts bool) error {
	return nil
}

func (m *mockSerialPort) GetModemStatusBits() (*serial.ModemStatusBits, error) {
	return &serial.ModemStatusBits{}, nil
}

func (m *mockSerialPort) Break(duration time.Duration) error {
	return nil
}

func (m *mockSerialPort) Drain() error {
	return nil
}

func (m *mockSerialPort) SetReadTimeout(t time.Duration) error {
	return nil
}
