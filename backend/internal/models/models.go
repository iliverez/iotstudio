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
	ID        string      `json:"id"`
	DeviceID  string      `json:"deviceId"`
	ParserID  string      `json:"parserId"`
	Timestamp int64       `json:"timestamp"`
	Value     interface{} `json:"value"`
}

type Parser struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Type        string        `json:"type"`
	Fields      []ParserField `json:"fields"`
	BuiltInType string        `json:"builtinType`
	CreatedAt   time.Time     `json:"createdAt"`
	UpdatedAt   time.Time     `json:"updatedAt"`
}

type ParserField struct {
	Name        string  `json:"name"`
	DeviceID    string  `json:"deviceId"`
	DataType    string  `json:"dataType"`
	Offset      int     `json:"offset"`
	BitOffset   int     `json:"bitOffset"`
	BitWidth    int     `json:"bitWidth"`
	Endianness  string  `json:"endianness"`
	Scale       float64 `json:"scale"`
	ValueOffset float64 `json:"offset"`
	ArrayLength int     `json:"arrayLength"`
}
