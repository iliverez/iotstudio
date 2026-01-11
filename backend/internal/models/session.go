package models

import (
	"errors"
	"strings"
	"time"
)

func (s *Session) Validate() error {
	if strings.TrimSpace(s.ID) == "" {
		return errors.New("session ID cannot be empty")
	}
	if strings.TrimSpace(s.Name) == "" {
		return errors.New("session name cannot be empty")
	}
	return nil
}

func (d *Device) Validate() error {
	if strings.TrimSpace(d.ID) == "" {
		return errors.New("device ID cannot be empty")
	}
	if strings.TrimSpace(d.Name) == "" {
		return errors.New("device name cannot be empty")
	}
	if d.Address > 247 {
		return errors.New("device address must be between 0 and 247")
	}
	return nil
}

// Session represents a telemetry session
type Session struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	CreatedAt time.Time     `json:"createdAt"`
	UpdatedAt time.Time     `json:"updatedAt"`
	Status    string        `json:"status"`
}

// Connection represents a connection to a device or network
type Connection struct {
	ID        string          `json:"id"`
	SessionID string          `json:"sessionId"`
	Type      string          `json:"type"`
	Name      string          `json:"name"`
	Config    string          `json:"config"` // JSON string
	Status    string          `json:"status"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// Device represents a device that can be monitored
type Device struct {
	ID          string    `json:"id"`
	SessionID   string    `json:"sessionId"`
	ConnectionID string   `json:"connectionId"`
	Address     uint8     `json:"address"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	ParserID    string    `json:"parserId"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// Parser represents a data parser configuration
type Parser struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Type        string `json:"type"` // "visual" or "javascript"
	VisualRules string `json:"visualRules"` // JSON string
	JavaScript  string `json:"javascript"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// DataPoint represents a single data point from a device
type DataPoint struct {
	SessionID  string                 `json:"sessionId"`
	DeviceID   string                 `json:"deviceId"`
	Timestamp  int64                  `json:"timestamp"`
	Data       map[string]interface{} `json:"data"`
}

// VisualRule represents a single visual parsing rule
type VisualRule struct {
	Name        string  `json:"name"`
	DataType    string  `json:"dataType"`
	StartOffset int     `json:"startOffset"`
	BitOffset   int     `json:"bitOffset"`
	BitWidth    int     `json:"bitWidth"`
	Endianness  string  `json:"endianness"`
	Scale       float64 `json:"scale"`
	Offset      float64 `json:"offset"`
}
