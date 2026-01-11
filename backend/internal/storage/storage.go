package storage

import (
	"context"

	"github.com/iotstudio/iotstudio/internal/models"
)

// Storage defines the interface for all storage operations
type Storage interface {
	// Sessions
	CreateSession(ctx context.Context, session *models.Session) error
	GetSession(ctx context.Context, id string) (*models.Session, error)
	ListSessions(ctx context.Context) ([]*models.Session, error)
	UpdateSession(ctx context.Context, session *models.Session) error
	DeleteSession(ctx context.Context, id string) error

	// Connections
	CreateConnection(ctx context.Context, conn *models.Connection) error
	GetConnection(ctx context.Context, id string) (*models.Connection, error)
	ListConnectionsBySession(ctx context.Context, sessionID string) ([]*models.Connection, error)
	UpdateConnection(ctx context.Context, conn *models.Connection) error
	DeleteConnection(ctx context.Context, id string) error

	// Devices
	CreateDevice(ctx context.Context, device *models.Device) error
	GetDevice(ctx context.Context, id string) (*models.Device, error)
	ListDevicesBySession(ctx context.Context, sessionID string) ([]*models.Device, error)
	ListDevicesByConnection(ctx context.Context, connectionID string) ([]*models.Device, error)
	UpdateDevice(ctx context.Context, device *models.Device) error
	DeleteDevice(ctx context.Context, id string) error

	// Parsers
	CreateParser(ctx context.Context, parser *models.Parser) error
	GetParser(ctx context.Context, id string) (*models.Parser, error)
	ListParsers(ctx context.Context) ([]*models.Parser, error)
	UpdateParser(ctx context.Context, parser *models.Parser) error
	DeleteParser(ctx context.Context, id string) error

	// Time-series data
	WriteDataPoints(ctx context.Context, points []models.DataPoint) error
	QueryData(ctx context.Context, sessionID string, deviceID string, start, end int64) ([]models.DataPoint, error)

	// Close closes the storage connection
	Close() error
}
