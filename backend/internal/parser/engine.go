package parser

import (
	"context"
	"encoding/binary"
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/iotstudio/iotstudio/internal/models"
)

type ParserResult struct {
	DeviceData map[string]map[string]interface{}
	Error      error
}

type Engine struct {
	parsers map[string]*models.Parser
}

func NewEngine() *Engine {
	return &Engine{
		parsers: make(map[string]*models.Parser),
	}
}

func (e *Engine) Parse(ctx context.Context, mparser *models.Parser, data []byte) (*ParserResult, error) {
	result := &ParserResult{
		DeviceData: make(map[string]map[string]interface{}),
	}

	if mparser.BuiltInType != "" {
		return e.parseBuiltIn(ctx, mparser, data)
	}

	deviceFields := make(map[string][]models.ParserField)
	for _, field := range mparser.Fields {
		deviceFields[field.DeviceID] = append(deviceFields[field.DeviceID], field)
	}

	for deviceID, fields := range deviceFields {
		deviceData := make(map[string]interface{})

		for _, field := range fields {
			value, err := e.parseField(field, data)
			if err != nil {
				return nil, fmt.Errorf("failed to parse field %s for device %s: %w",
					field.Name, deviceID, err)
			}

			deviceData[field.Name] = value
		}

		result.DeviceData[deviceID] = deviceData
	}

	return result, nil
}

func (e *Engine) parseBuiltIn(ctx context.Context, mparser *models.Parser, data []byte) (*ParserResult, error) {
	result := &ParserResult{
		DeviceData: make(map[string]map[string]interface{}),
	}

	switch mparser.BuiltInType {
	case BuiltInIEEE3Floats:
		if len(data) < 12 {
			return nil, fmt.Errorf("data too short for 3 floats: %d bytes", len(data))
		}

		values := make([]float32, 3)
		for i := 0; i < 3; i++ {
			bits := binary.LittleEndian.Uint32(data[i*4 : (i+1)*4])
			values[i] = float32(math.Float32frombits(uint32(bits)))
		}

		deviceData := make(map[string]interface{})
		if len(mparser.Fields) >= 3 {
			deviceData[mparser.Fields[0].Name] = values[0]
			deviceData[mparser.Fields[1].Name] = values[1]
			deviceData[mparser.Fields[2].Name] = values[2]
		}

		result.DeviceData[mparser.Fields[0].DeviceID] = deviceData

	case BuiltInASCII3Floats:
		if len(data) != 8 {
			return nil, fmt.Errorf("invalid ASCII data length: %d", len(data))
		}

		integral, err := strconv.ParseInt(string(data[0:4]), 10, 64)
		if err != nil {
			return nil, fmt.Errorf("failed to parse integral part: %w", err)
		}

		decimal, err := strconv.ParseInt(string(data[4:8]), 10, 64)
		if err != nil {
			return nil, fmt.Errorf("failed to parse decimal part: %w", err)
		}

		value := float64(integral) + float64(decimal)/10000.0

		deviceData := map[string]interface{}{
			mparser.Fields[0].Name: value,
		}
		result.DeviceData[mparser.Fields[0].DeviceID] = deviceData

	case BuiltInRawBytes:
		deviceData := map[string]interface{}{
			mparser.Fields[0].Name: data,
		}
		result.DeviceData[mparser.Fields[0].DeviceID] = deviceData

	default:
		return nil, fmt.Errorf("unknown built-in parser type: %s", mparser.BuiltInType)
	}

	return result, nil
}

func (e *Engine) parseField(field models.ParserField, data []byte) (interface{}, error) {
	if field.Offset < 0 || field.Offset >= len(data) {
		return nil, fmt.Errorf("offset %d out of bounds", field.Offset)
	}

	switch field.DataType {
	case "uint8":
		if field.Offset+1 > len(data) {
			return nil, fmt.Errorf("insufficient data for uint8")
		}
		value := uint8(data[field.Offset])
		return applyTransform(float64(value), field.Scale, field.ValueOffset), nil

	case "int8":
		if field.Offset+1 > len(data) {
			return nil, fmt.Errorf("insufficient data for int8")
		}
		value := int8(data[field.Offset])
		return applyTransform(float64(value), field.Scale, float64(field.Offset)), nil

	case "uint16":
		if field.Offset+2 > len(data) {
			return nil, fmt.Errorf("insufficient data for uint16")
		}
		value := binary.BigEndian.Uint16(data[field.Offset : field.Offset+2])
		if field.Endianness == "little" {
			value = binary.LittleEndian.Uint16(data[field.Offset : field.Offset+2])
		}
		return applyTransform(float64(value), field.Scale, field.ValueOffset), nil

	case "int16":
		if field.Offset+2 > len(data) {
			return nil, fmt.Errorf("insufficient data for int16")
		}
		value := int16(binary.BigEndian.Uint16(data[field.Offset : field.Offset+2]))
		if field.Endianness == "little" {
			value = int16(binary.LittleEndian.Uint16(data[field.Offset : field.Offset+2]))
		}
		return applyTransform(float64(value), field.Scale, float64(field.Offset)), nil

	case "uint32":
		if field.Offset+4 > len(data) {
			return nil, fmt.Errorf("insufficient data for uint32")
		}
		value := binary.BigEndian.Uint32(data[field.Offset : field.Offset+4])
		if field.Endianness == "little" {
			value = binary.LittleEndian.Uint32(data[field.Offset : field.Offset+4])
		}
		return applyTransform(float64(value), field.Scale, float64(field.Offset)), nil

	case "int32":
		if field.Offset+4 > len(data) {
			return nil, fmt.Errorf("insufficient data for int32")
		}
		value := int32(binary.BigEndian.Uint32(data[field.Offset : field.Offset+4]))
		if field.Endianness == "little" {
			value = int32(binary.LittleEndian.Uint32(data[field.Offset : field.Offset+4]))
		}
		return applyTransform(float64(value), field.Scale, field.ValueOffset), nil

	case "float32":
		if field.Offset+4 > len(data) {
			return nil, fmt.Errorf("insufficient data for float32")
		}
		bits := binary.BigEndian.Uint32(data[field.Offset : field.Offset+4])
		if field.Endianness == "little" {
			bits = binary.LittleEndian.Uint32(data[field.Offset : field.Offset+4])
		}
		value := float32(math.Float32frombits(uint32(bits)))
		return applyTransform(float64(value), field.Scale, float64(field.Offset)), nil

	case "float64":
		if field.Offset+8 > len(data) {
			return nil, fmt.Errorf("insufficient data for float64")
		}
		bits := binary.BigEndian.Uint64(data[field.Offset : field.Offset+8])
		if field.Endianness == "little" {
			bits = binary.LittleEndian.Uint64(data[field.Offset : field.Offset+8])
		}
		value := math.Float64frombits(bits)
		return applyTransform(value, field.Scale, float64(field.Offset)), nil

	case "ascii_int":
		length := 4
		if field.ArrayLength > 0 {
			length = field.ArrayLength
		}
		if field.Offset+length > len(data) {
			return nil, fmt.Errorf("insufficient data for ascii_int")
		}
		value, err := strconv.ParseInt(strings.TrimSpace(string(data[field.Offset:field.Offset+length])), 10, 64)
		if err != nil {
			return nil, fmt.Errorf("failed to parse ascii_int: %w", err)
		}
		return applyTransform(float64(value), field.Scale, float64(field.Offset)), nil

	case "ascii_decimal":
		length := 8
		if field.ArrayLength > 0 {
			length = field.ArrayLength
		}
		if field.Offset+length > len(data) {
			return nil, fmt.Errorf("insufficient data for ascii_decimal")
		}
		integral, err := strconv.ParseInt(string(data[field.Offset:field.Offset+length/2]), 10, 64)
		if err != nil {
			return nil, fmt.Errorf("failed to parse ascii_decimal integral: %w", err)
		}
		decimal, err := strconv.ParseInt(string(data[field.Offset+length/2:field.Offset+length]), 10, 64)
		if err != nil {
			return nil, fmt.Errorf("failed to parse ascii_decimal fractional: %w", err)
		}
		divisor := math.Pow(10, float64(len(data[field.Offset+length/2:field.Offset+length])))
		value := float64(integral) + float64(decimal)/divisor
		return applyTransform(value, field.Scale, float64(field.Offset)), nil

	case "string":
		length := len(data) - field.Offset
		if field.ArrayLength > 0 && field.Offset+field.ArrayLength <= len(data) {
			length = field.ArrayLength
		}
		return strings.TrimSpace(string(data[field.Offset : field.Offset+length])), nil

	case "raw_bytes":
		length := len(data) - field.Offset
		if field.ArrayLength > 0 && field.Offset+field.ArrayLength <= len(data) {
			length = field.ArrayLength
		}
		return data[field.Offset : field.Offset+length], nil

	default:
		return nil, fmt.Errorf("unknown data type: %s", field.DataType)
	}
}

func applyTransform(value float64, scale float64, valueOffset float64) interface{} {
	if scale == 0 {
		scale = 1.0
	}
	return value*scale + valueOffset
}
