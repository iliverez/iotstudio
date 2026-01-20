package modbus

import (
	"errors"

	"github.com/rs/zerolog"
)

const (
	ExceptionIllegalFunction     = 0x01
	ExceptionIllegalDataAddress  = 0x02
	ExceptionIllegalDataValue    = 0x03
	ExceptionServerDeviceFailure = 0x04
	ExceptionAcknowledge         = 0x05
	ExceptionServerDeviceBusy    = 0x06
	ExceptionMemoryParityError   = 0x08
)

type ModbusLogger struct {
	logger zerolog.Logger
}

func NewModbusLogger(logger zerolog.Logger) *ModbusLogger {
	return &ModbusLogger{logger: logger}
}

func (l *ModbusLogger) LogTransaction(txID uint16, unitID uint8, funcCode uint8, request []byte, response []byte) {
	l.logger.Debug().
		Uint16("tx_id", txID).
		Uint8("unit_id", unitID).
		Uint8("func_code", funcCode).
		Bytes("request", request).
		Bytes("response", response).
		Msg("Modbus transaction")
}

func (l *ModbusLogger) LogException(txID uint16, exceptionCode uint8, message string) {
	l.logger.Warn().
		Uint16("tx_id", txID).
		Uint8("exception", exceptionCode).
		Str("message", message).
		Msg("Modbus exception")
}

func (l *ModbusLogger) LogRequest(txID uint16, unitID uint8, funcCode uint8, address uint16, quantity uint16) {
	l.logger.Debug().
		Uint16("tx_id", txID).
		Uint8("unit_id", unitID).
		Uint8("func_code", funcCode).
		Uint16("address", address).
		Uint16("quantity", quantity).
		Msg("Modbus request")
}

func (l *ModbusLogger) LogResponse(txID uint16, unitID uint8, funcCode uint8, byteCount uint8, data []byte) {
	l.logger.Debug().
		Uint16("tx_id", txID).
		Uint8("unit_id", unitID).
		Uint8("func_code", funcCode).
		Uint8("byte_count", byteCount).
		Bytes("data", data).
		Msg("Modbus response")
}

func CalculateCRC16(data []byte) uint16 {
	crc := uint16(0xFFFF)
	for _, b := range data {
		crc ^= uint16(b)
		for i := 0; i < 8; i++ {
			if crc&0x0001 != 0 {
				crc >>= 1
				crc ^= 0xA001
			} else {
				crc >>= 1
			}
		}
	}
	return crc
}

func ValidateCRC(data []byte, expectedCRC uint16) bool {
	return CalculateCRC16(data) == expectedCRC
}

var (
	ErrNotConnected    = errors.New("not connected")
	ErrTimeout         = errors.New("operation timed out")
	ErrInvalidResponse = errors.New("invalid Modbus response")
	ErrException       = errors.New("Modbus exception")
)

type modbusError struct {
	code    string
	message string
}

func (e *modbusError) Error() string {
	return e.code + ": " + e.message
}

func (e *modbusError) Unwrap() error {
	return nil
}
