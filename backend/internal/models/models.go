package models

import (
	"time"
)

type Session struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
	Status    string    `json:"status"`
}

type Connection struct {
	ID        string    `json:"id"`
	SessionID string    `json:"sessionId"`
	ParserID  string    `json:"parserId"`
	Type      string    `json:"type"`
	Name      string    `json:"name"`
	Config    string    `json:"config"`
	Framing   string    `json:"framing"`
	Delimiter string    `json:"delimiter"`
	FixedSize int       `json:"fixedSize"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Device struct {
	ID           string    `json:"id"`
	SessionID    string    `json:"sessionId"`
	ConnectionID string    `json:"connectionId"`
	Address      string    `json:"address"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	ParserID     string    `json:"parserId"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type DataPoint struct {
	SessionID string `json:"sessionId"`
	DeviceID  string `json:"deviceId"`
	Timestamp int64  `json:"timestamp"`
	Data      string `json:"data"`
}

type Parser struct {
	ID              string           `json:"id"`
	Name            string           `json:"name"`
	Type            string           `json:"type"`
	Fields          []ParserField    `json:"fields"`
	BuiltInType     string           `json:"builtinType"`
	ModbusRegisters []ModbusRegister `json:"modbusRegisters"`
	CreatedAt       time.Time        `json:"createdAt"`
	UpdatedAt       time.Time        `json:"updatedAt"`
}

type ParserField struct {
	Name              string  `json:"name"`
	DeviceID          string  `json:"deviceId"`
	DataType          string  `json:"dataType"`
	Offset            int     `json:"offset"`
	BitOffset         int     `json:"bitOffset"`
	BitWidth          int     `json:"bitWidth"`
	Endianness        string  `json:"endianness"`
	Scale             float64 `json:"scale"`
	ValueOffset       float64 `json:"offset"`
	ArrayLength       int     `json:"arrayLength"`
	EngineeringUnitID string  `json:"engineeringUnitId"`
}

type ModbusRegister struct {
	Name              string  `json:"name"`
	RegisterType      string  `json:"registerType"` // coil, discrete_input, holding_register, input_register
	Address           uint16  `json:"address"`
	Quantity          uint16  `json:"quantity"`
	DataType          string  `json:"dataType"` // bool, int16, uint16, int32, uint32, float32, float64
	Endianness        string  `json:"endianness"`
	Scale             float64 `json:"scale"`
	Offset            float64 `json:"offset"`
	EngineeringUnitID string  `json:"engineeringUnitId"`
}

type AggregationType string

const (
	AggregationAverage AggregationType = "average"
	AggregationMax     AggregationType = "max"
	AggregationMin     AggregationType = "min"
	AggregationLast    AggregationType = "last"
)

type SignalConfig struct {
	Name              string          `json:"name"`
	LoggingPeriod     int             `json:"loggingPeriod"`
	Aggregation       AggregationType `json:"aggregation"`
	EngineeringUnitID string          `json:"engineeringUnitId"`
}

type MonitoringSession struct {
	ID                   string                `json:"id"`
	Name                 string                `json:"name"`
	Comments             string                `json:"comments"`
	DeviceID             string                `json:"deviceId"`
	SamplingPeriod       int                   `json:"samplingPeriod"`
	DefaultLoggingPeriod int                   `json:"defaultLoggingPeriod"`
	DefaultAggregation   AggregationType       `json:"defaultAggregation"`
	SignalConfigs        []SignalConfig        `json:"signalConfigs"`
	StartTime            int64                 `json:"startTime"`
	EndTime              int64                 `json:"endTime"`
	DataPoints           []AggregatedDataPoint `json:"dataPoints"`
	RawDataPoints        []RawDataPoint        `json:"rawDataPoints"`
	CreatedAt            time.Time             `json:"createdAt"`
}

type RawDataPoint struct {
	Timestamp int64                  `json:"timestamp"`
	Data      map[string]interface{} `json:"data"`
}

type AggregatedDataPoint struct {
	Timestamp   int64                  `json:"timestamp"`
	PeriodStart int64                  `json:"periodStart"`
	PeriodEnd   int64                  `json:"periodEnd"`
	Data        map[string]interface{} `json:"data"`
}

type EngineeringUnit struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Symbol      string    `json:"symbol"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"createdAt"`
}

type AnnotationType string

const (
	AnnotationTypeRegion AnnotationType = "region"
	AnnotationTypePoint  AnnotationType = "point"
)

type Annotation struct {
	ID                  string            `json:"id"`
	MonitoringSessionID string            `json:"monitoringSessionId"`
	Type                AnnotationType    `json:"type"`
	Title               string            `json:"title,omitempty"`
	Text                string            `json:"text"`
	RegionStart         int64             `json:"regionStart,omitempty"`
	RegionEnd           int64             `json:"regionEnd,omitempty"`
	Points              []AnnotationPoint `json:"points,omitempty"`
	CreatedAt           time.Time         `json:"createdAt"`
	UpdatedAt           time.Time         `json:"updatedAt"`
}

type AnnotationPoint struct {
	SignalName string  `json:"signalName"`
	Timestamp  int64   `json:"timestamp"`
	Value      float64 `json:"value"`
}
