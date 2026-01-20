package modbus

import (
	"encoding/binary"
	"fmt"
)

type MBAPHeader struct {
	TransactionID uint16
	ProtocolID    uint16
	Length        uint16
	UnitID        uint8
}

func NewMBAPHeader(transactionID uint16, unitID uint8, pduLength uint16) MBAPHeader {
	return MBAPHeader{
		TransactionID: transactionID,
		ProtocolID:    0,
		Length:        uint16(unitID) + pduLength,
		UnitID:        unitID,
	}
}

type ReadCoilsRequest struct {
	FunctionCode    uint8
	StartingAddress uint16
	Quantity        uint16
}

type ReadCoilsResponse struct {
	FunctionCode uint8
	ByteCount    uint8
	CoilStatus   []bool
}

type ReadDiscreteInputsRequest struct {
	FunctionCode    uint8
	StartingAddress uint16
	Quantity        uint16
}

type ReadDiscreteInputsResponse struct {
	FunctionCode uint8
	ByteCount    uint8
	InputStatus  []bool
}

type ReadHoldingRegistersRequest struct {
	FunctionCode    uint8
	StartingAddress uint16
	Quantity        uint16
}

type ReadHoldingRegistersResponse struct {
	FunctionCode   uint8
	ByteCount      uint8
	RegisterValues []uint16
}

type ReadInputRegistersRequest struct {
	FunctionCode    uint8
	StartingAddress uint16
	Quantity        uint16
}

type ReadInputRegistersResponse struct {
	FunctionCode   uint8
	ByteCount      uint8
	RegisterValues []uint16
}

type WriteSingleCoilRequest struct {
	FunctionCode  uint8
	OutputAddress uint16
	OutputValue   uint16
}

type WriteSingleCoilResponse struct {
	FunctionCode  uint8
	OutputAddress uint16
	OutputValue   uint16
}

type WriteSingleRegisterRequest struct {
	FunctionCode    uint8
	RegisterAddress uint16
	RegisterValue   uint16
}

type WriteSingleRegisterResponse struct {
	FunctionCode    uint8
	RegisterAddress uint16
	RegisterValue   uint16
}

type WriteMultipleCoilsRequest struct {
	FunctionCode    uint8
	StartingAddress uint16
	Quantity        uint16
	OutputValues    []uint8
}

type WriteMultipleCoilsResponse struct {
	FunctionCode    uint8
	StartingAddress uint16
	Quantity        uint16
	OutputValues    []uint8
}

type WriteMultipleRegistersRequest struct {
	FunctionCode    uint8
	StartingAddress uint16
	RegisterValues  []uint16
}

type WriteMultipleRegistersResponse struct {
	FunctionCode    uint8
	StartingAddress uint16
	RegisterValues  []uint16
}

type MaskWriteRegisterRequest struct {
	FunctionCode    uint8
	RegisterAddress uint16
	AndMask         uint16
	OrMask          uint16
}

type MaskWriteRegisterResponse struct {
	FunctionCode    uint8
	RegisterAddress uint16
	AndMask         uint16
	OrMask          uint16
}

type ReadWriteMultipleRegistersRequest struct {
	FunctionCode      uint8
	ReadStartAddress  uint16
	ReadWriteCount    uint16
	WriteStartAddress uint16
	RegisterValues    []uint16
}

type ReadWriteMultipleRegistersResponse struct {
	FunctionCode   uint8
	RegisterValues []uint16
}

func BuildMBAPFrame(header MBAPHeader, pdu []byte) []byte {
	frame := make([]byte, 7+len(pdu))
	binary.BigEndian.PutUint16(frame[0:2], header.TransactionID)
	binary.BigEndian.PutUint16(frame[2:4], header.ProtocolID)
	binary.BigEndian.PutUint16(frame[4:6], header.Length)
	frame[6] = header.UnitID
	copy(frame[7:], pdu)
	return frame
}

func ParseMBAPHeader(data []byte) (MBAPHeader, error) {
	if len(data) < 7 {
		return MBAPHeader{}, fmt.Errorf("data too short for MBAP header")
	}

	return MBAPHeader{
		TransactionID: binary.BigEndian.Uint16(data[0:2]),
		ProtocolID:    binary.BigEndian.Uint16(data[2:4]),
		Length:        binary.BigEndian.Uint16(data[4:6]),
		UnitID:        data[6],
	}, nil
}
