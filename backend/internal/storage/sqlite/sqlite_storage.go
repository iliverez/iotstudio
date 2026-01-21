package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/iotstudio/iotstudio/internal/models"
	"github.com/rs/zerolog/log"
	_ "modernc.org/sqlite"
)

const (
	maxOpenConnections    = 25
	maxIdleConnections    = 10
	connectionMaxLifetime = 5 * time.Minute
	connectionMaxIdleTime = 1 * time.Minute
	maxBatchSize          = 100
	batchInterval         = 1 * time.Second
)

type SQLiteStorage struct {
	db    *sql.DB
	mu    sync.RWMutex
	ready bool
}

func NewSQLiteStorage(dataSource string) (*SQLiteStorage, error) {
	db, err := sql.Open("sqlite", dataSource)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	db.SetMaxOpenConns(maxOpenConnections)
	db.SetMaxIdleConns(maxIdleConnections)
	db.SetConnMaxLifetime(connectionMaxLifetime)
	db.SetConnMaxIdleTime(connectionMaxIdleTime)

	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		log.Warn().Err(err).Msg("Failed to enable WAL mode")
	}

	if _, err := db.Exec("PRAGMA busy_timeout=5000"); err != nil {
		log.Warn().Err(err).Msg("Failed to set busy timeout")
	}

	storage := &SQLiteStorage{db: db}

	if err := storage.migrate(); err != nil {
		return nil, fmt.Errorf("migration failed: %w", err)
	}

	storage.ready = true
	return storage, nil
}

func (s *SQLiteStorage) migrate() error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			status TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS connections (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			parser_id TEXT,
			type TEXT NOT NULL,
			name TEXT NOT NULL,
			config TEXT NOT NULL,
			framing TEXT NOT NULL,
			delimiter TEXT,
			fixed_size INTEGER,
			status TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
			FOREIGN KEY (parser_id) REFERENCES parsers(id) ON DELETE SET NULL
		)`,
		`CREATE TABLE IF NOT EXISTS devices (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			connection_id TEXT NOT NULL,
			address TEXT,
			name TEXT NOT NULL,
			description TEXT,
			parser_id TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
			FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS parsers (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			type TEXT NOT NULL,
			fields TEXT NOT NULL,
			built_in_type TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS data_points (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL,
			device_id TEXT NOT NULL,
			timestamp INTEGER NOT NULL,
			data TEXT NOT NULL,
			FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
			FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`,
		`CREATE INDEX IF NOT EXISTS idx_connections_session ON connections(session_id)`,
		`CREATE INDEX IF NOT EXISTS idx_devices_session ON devices(session_id)`,
		`CREATE INDEX IF NOT EXISTS idx_devices_connection ON devices(connection_id)`,
		`CREATE INDEX IF NOT EXISTS idx_data_points_session_device ON data_points(session_id, device_id)`,
		`CREATE INDEX IF NOT EXISTS idx_data_points_timestamp ON data_points(timestamp)`,
	}

	for _, migration := range migrations {
		if _, err := s.db.Exec(migration); err != nil {
			return fmt.Errorf("migration failed: %s: %w", migration, err)
		}
	}

	return nil
}

func (s *SQLiteStorage) CreateSession(ctx context.Context, session *models.Session) error {
	if err := session.Validate(); err != nil {
		return err
	}

	query := `
		INSERT INTO sessions (id, name, status, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
	`

	result, err := s.db.ExecContext(ctx, query,
		session.ID,
		session.Name,
		session.Status,
		session.CreatedAt.Unix(),
		session.UpdatedAt.Unix(),
	)
	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("no rows inserted")
	}

	return nil
}

func (s *SQLiteStorage) GetSession(ctx context.Context, id string) (*models.Session, error) {
	query := `
		SELECT id, name, status, created_at, updated_at
		FROM sessions
		WHERE id = ?
	`

	var session models.Session
	var createdAt, updatedAt int64

	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&session.ID,
		&session.Name,
		&session.Status,
		&createdAt,
		&updatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("session not found: %s", id)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get session: %w", err)
	}

	session.CreatedAt = time.Unix(createdAt, 0)
	session.UpdatedAt = time.Unix(updatedAt, 0)

	return &session, nil
}

func (s *SQLiteStorage) ListSessions(ctx context.Context) ([]*models.Session, error) {
	query := `
		SELECT id, name, status, created_at, updated_at
		FROM sessions
		ORDER BY created_at DESC
	`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list sessions: %w", err)
	}
	defer rows.Close()

	var sessions []*models.Session

	for rows.Next() {
		var session models.Session
		var createdAt, updatedAt int64

		if err := rows.Scan(
			&session.ID,
			&session.Name,
			&session.Status,
			&createdAt,
			&updatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan session: %w", err)
		}

		session.CreatedAt = time.Unix(createdAt, 0)
		session.UpdatedAt = time.Unix(updatedAt, 0)
		sessions = append(sessions, &session)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating sessions: %w", err)
	}

	return sessions, nil
}

func (s *SQLiteStorage) UpdateSession(ctx context.Context, session *models.Session) error {
	if err := session.Validate(); err != nil {
		return err
	}

	query := `
		UPDATE sessions
		SET name = ?, status = ?, updated_at = ?
		WHERE id = ?
	`

	session.UpdatedAt = time.Now()
	result, err := s.db.ExecContext(ctx, query,
		session.Name,
		session.Status,
		session.UpdatedAt.Unix(),
		session.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update session: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("session not found: %s", session.ID)
	}

	return nil
}

func (s *SQLiteStorage) DeleteSession(ctx context.Context, id string) error {
	query := `DELETE FROM sessions WHERE id = ?`

	result, err := s.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete session: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("session not found: %s", id)
	}

	return nil
}

func (s *SQLiteStorage) CreateConnection(ctx context.Context, conn *models.Connection) error {
	query := `
		INSERT INTO connections (id, session_id, parser_id, type, name, config, framing, delimiter, fixed_size, status, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	result, err := s.db.ExecContext(ctx, query,
		conn.ID,
		conn.SessionID,
		nullString(conn.ParserID),
		conn.Type,
		conn.Name,
		conn.Config,
		conn.Framing,
		nullString(conn.Delimiter),
		nullInt(conn.FixedSize),
		conn.Status,
		conn.CreatedAt.Unix(),
		conn.UpdatedAt.Unix(),
	)
	if err != nil {
		return fmt.Errorf("failed to create connection: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("no rows inserted")
	}

	return nil
}

func (s *SQLiteStorage) GetConnection(ctx context.Context, id string) (*models.Connection, error) {
	query := `
		SELECT id, session_id, parser_id, type, name, config, framing, delimiter, fixed_size, status, created_at, updated_at
		FROM connections
		WHERE id = ?
	`

	var conn models.Connection
	var createdAt, updatedAt int64
	var parserID, delimiter sql.NullString
	var fixedSize sql.NullInt64

	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&conn.ID,
		&conn.SessionID,
		&parserID,
		&conn.Type,
		&conn.Name,
		&conn.Config,
		&conn.Framing,
		&delimiter,
		&fixedSize,
		&conn.Status,
		&createdAt,
		&updatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("connection not found: %s", id)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}

	if parserID.Valid {
		conn.ParserID = parserID.String
	}
	if delimiter.Valid {
		conn.Delimiter = delimiter.String
	}
	if fixedSize.Valid {
		conn.FixedSize = int(fixedSize.Int64)
	}

	conn.CreatedAt = time.Unix(createdAt, 0)
	conn.UpdatedAt = time.Unix(updatedAt, 0)

	return &conn, nil
}

func (s *SQLiteStorage) ListConnectionsBySession(ctx context.Context, sessionID string) ([]*models.Connection, error) {
	query := `
		SELECT id, session_id, parser_id, type, name, config, framing, delimiter, fixed_size, status, created_at, updated_at
		FROM connections
		WHERE session_id = ?
		ORDER BY created_at DESC
	`

	rows, err := s.db.QueryContext(ctx, query, sessionID)
	if err != nil {
		return nil, fmt.Errorf("failed to list connections: %w", err)
	}
	defer rows.Close()

	var connections []*models.Connection

	for rows.Next() {
		var conn models.Connection
		var createdAt, updatedAt int64
		var parserID, delimiter sql.NullString
		var fixedSize sql.NullInt64

		if err := rows.Scan(
			&conn.ID,
			&conn.SessionID,
			&parserID,
			&conn.Type,
			&conn.Name,
			&conn.Config,
			&conn.Framing,
			&delimiter,
			&fixedSize,
			&conn.Status,
			&createdAt,
			&updatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan connection: %w", err)
		}

		if parserID.Valid {
			conn.ParserID = parserID.String
		}
		if delimiter.Valid {
			conn.Delimiter = delimiter.String
		}
		if fixedSize.Valid {
			conn.FixedSize = int(fixedSize.Int64)
		}

		conn.CreatedAt = time.Unix(createdAt, 0)
		conn.UpdatedAt = time.Unix(updatedAt, 0)
		connections = append(connections, &conn)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating connections: %w", err)
	}

	return connections, nil
}

func (s *SQLiteStorage) UpdateConnection(ctx context.Context, conn *models.Connection) error {
	query := `
		UPDATE connections
		SET name = ?, config = ?, framing = ?, delimiter = ?, fixed_size = ?, status = ?, updated_at = ?
		WHERE id = ?
	`

	conn.UpdatedAt = time.Now()
	result, err := s.db.ExecContext(ctx, query,
		conn.Name,
		conn.Config,
		conn.Framing,
		nullString(conn.Delimiter),
		nullInt(conn.FixedSize),
		conn.Status,
		conn.UpdatedAt.Unix(),
		conn.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update connection: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("connection not found: %s", conn.ID)
	}

	return nil
}

func (s *SQLiteStorage) DeleteConnection(ctx context.Context, id string) error {
	query := `DELETE FROM connections WHERE id = ?`

	result, err := s.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete connection: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("connection not found: %s", id)
	}

	return nil
}

func (s *SQLiteStorage) CreateDevice(ctx context.Context, device *models.Device) error {
	if err := device.Validate(); err != nil {
		return err
	}

	query := `
		INSERT INTO devices (id, session_id, connection_id, address, name, description, parser_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	result, err := s.db.ExecContext(ctx, query,
		device.ID,
		device.SessionID,
		device.ConnectionID,
		nullString(device.Address),
		device.Name,
		nullString(device.Description),
		nullString(device.ParserID),
		device.CreatedAt.Unix(),
		device.UpdatedAt.Unix(),
	)
	if err != nil {
		return fmt.Errorf("failed to create device: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("no rows inserted")
	}

	return nil
}

func (s *SQLiteStorage) GetDevice(ctx context.Context, id string) (*models.Device, error) {
	query := `
		SELECT id, session_id, connection_id, address, name, description, parser_id, created_at, updated_at
		FROM devices
		WHERE id = ?
	`

	var device models.Device
	var createdAt, updatedAt int64
	var address, description, parserID sql.NullString

	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&device.ID,
		&device.SessionID,
		&device.ConnectionID,
		&address,
		&device.Name,
		&description,
		&parserID,
		&createdAt,
		&updatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("device not found: %s", id)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get device: %w", err)
	}

	if address.Valid {
		device.Address = address.String
	}
	if description.Valid {
		device.Description = description.String
	}
	if parserID.Valid {
		device.ParserID = parserID.String
	}

	device.CreatedAt = time.Unix(createdAt, 0)
	device.UpdatedAt = time.Unix(updatedAt, 0)

	return &device, nil
}

func (s *SQLiteStorage) ListDevicesBySession(ctx context.Context, sessionID string) ([]*models.Device, error) {
	query := `
		SELECT id, session_id, connection_id, address, name, description, parser_id, created_at, updated_at
		FROM devices
		WHERE session_id = ?
		ORDER BY name ASC
	`

	rows, err := s.db.QueryContext(ctx, query, sessionID)
	if err != nil {
		return nil, fmt.Errorf("failed to list devices: %w", err)
	}
	defer rows.Close()

	var devices []*models.Device

	for rows.Next() {
		var device models.Device
		var createdAt, updatedAt int64
		var address, description, parserID sql.NullString

		if err := rows.Scan(
			&device.ID,
			&device.SessionID,
			&device.ConnectionID,
			&address,
			&device.Name,
			&description,
			&parserID,
			&createdAt,
			&updatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan device: %w", err)
		}

		if address.Valid {
			device.Address = address.String
		}
		if description.Valid {
			device.Description = description.String
		}
		if parserID.Valid {
			device.ParserID = parserID.String
		}

		device.CreatedAt = time.Unix(createdAt, 0)
		device.UpdatedAt = time.Unix(updatedAt, 0)
		devices = append(devices, &device)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating devices: %w", err)
	}

	return devices, nil
}

func (s *SQLiteStorage) ListDevicesByConnection(ctx context.Context, connectionID string) ([]*models.Device, error) {
	query := `
		SELECT id, session_id, connection_id, address, name, description, parser_id, created_at, updated_at
		FROM devices
		WHERE connection_id = ?
		ORDER BY name ASC
	`

	rows, err := s.db.QueryContext(ctx, query, connectionID)
	if err != nil {
		return nil, fmt.Errorf("failed to list devices: %w", err)
	}
	defer rows.Close()

	var devices []*models.Device

	for rows.Next() {
		var device models.Device
		var createdAt, updatedAt int64
		var address, description, parserID sql.NullString

		if err := rows.Scan(
			&device.ID,
			&device.SessionID,
			&device.ConnectionID,
			&address,
			&device.Name,
			&description,
			&parserID,
			&createdAt,
			&updatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan device: %w", err)
		}

		if address.Valid {
			device.Address = address.String
		}
		if description.Valid {
			device.Description = description.String
		}
		if parserID.Valid {
			device.ParserID = parserID.String
		}

		device.CreatedAt = time.Unix(createdAt, 0)
		device.UpdatedAt = time.Unix(updatedAt, 0)
		devices = append(devices, &device)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating devices: %w", err)
	}

	return devices, nil
}

func (s *SQLiteStorage) UpdateDevice(ctx context.Context, device *models.Device) error {
	if err := device.Validate(); err != nil {
		return err
	}

	query := `
		UPDATE devices
		SET name = ?, description = ?, parser_id = ?, updated_at = ?
		WHERE id = ?
	`

	device.UpdatedAt = time.Now()
	result, err := s.db.ExecContext(ctx, query,
		device.Name,
		nullString(device.Description),
		nullString(device.ParserID),
		device.UpdatedAt.Unix(),
		device.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update device: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("device not found: %s", device.ID)
	}

	return nil
}

func (s *SQLiteStorage) DeleteDevice(ctx context.Context, id string) error {
	query := `DELETE FROM devices WHERE id = ?`

	result, err := s.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete device: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("device not found: %s", id)
	}

	return nil
}

func (s *SQLiteStorage) CreateParser(ctx context.Context, parser *models.Parser) error {
	fieldsJSON, err := json.Marshal(parser.Fields)
	if err != nil {
		return fmt.Errorf("failed to marshal parser fields: %w", err)
	}

	query := `
		INSERT INTO parsers (id, name, type, fields, built_in_type, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`

	result, err := s.db.ExecContext(ctx, query,
		parser.ID,
		parser.Name,
		parser.Type,
		string(fieldsJSON),
		nullString(parser.BuiltInType),
		parser.CreatedAt.Unix(),
		parser.UpdatedAt.Unix(),
	)
	if err != nil {
		return fmt.Errorf("failed to create parser: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("no rows inserted")
	}

	return nil
}

func (s *SQLiteStorage) GetParser(ctx context.Context, id string) (*models.Parser, error) {
	query := `
		SELECT id, name, type, fields, built_in_type, created_at, updated_at
		FROM parsers
		WHERE id = ?
	`

	var parser models.Parser
	var createdAt, updatedAt int64
	var builtInType sql.NullString
	var fieldsJSON string

	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&parser.ID,
		&parser.Name,
		&parser.Type,
		&fieldsJSON,
		&builtInType,
		&createdAt,
		&updatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("parser not found: %s", id)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get parser: %w", err)
	}

	if err := json.Unmarshal([]byte(fieldsJSON), &parser.Fields); err != nil {
		return nil, fmt.Errorf("failed to unmarshal parser fields: %w", err)
	}

	if builtInType.Valid {
		parser.BuiltInType = builtInType.String
	}

	parser.CreatedAt = time.Unix(createdAt, 0)
	parser.UpdatedAt = time.Unix(updatedAt, 0)

	return &parser, nil
}

func (s *SQLiteStorage) ListParsers(ctx context.Context) ([]*models.Parser, error) {
	query := `
		SELECT id, name, type, fields, built_in_type, created_at, updated_at
		FROM parsers
		ORDER BY created_at DESC
	`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list parsers: %w", err)
	}
	defer rows.Close()

	var parsers []*models.Parser

	for rows.Next() {
		var parser models.Parser
		var createdAt, updatedAt int64
		var builtInType sql.NullString
		var fieldsJSON string

		if err := rows.Scan(
			&parser.ID,
			&parser.Name,
			&parser.Type,
			&fieldsJSON,
			&builtInType,
			&createdAt,
			&updatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan parser: %w", err)
		}

		if err := json.Unmarshal([]byte(fieldsJSON), &parser.Fields); err != nil {
			return nil, fmt.Errorf("failed to unmarshal parser fields: %w", err)
		}

		if builtInType.Valid {
			parser.BuiltInType = builtInType.String
		}

		parser.CreatedAt = time.Unix(createdAt, 0)
		parser.UpdatedAt = time.Unix(updatedAt, 0)
		parsers = append(parsers, &parser)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating parsers: %w", err)
	}

	return parsers, nil
}

func (s *SQLiteStorage) UpdateParser(ctx context.Context, parser *models.Parser) error {
	fieldsJSON, err := json.Marshal(parser.Fields)
	if err != nil {
		return fmt.Errorf("failed to marshal parser fields: %w", err)
	}

	query := `
		UPDATE parsers
		SET name = ?, type = ?, fields = ?, built_in_type = ?, updated_at = ?
		WHERE id = ?
	`

	parser.UpdatedAt = time.Now()
	result, err := s.db.ExecContext(ctx, query,
		parser.Name,
		parser.Type,
		string(fieldsJSON),
		nullString(parser.BuiltInType),
		parser.UpdatedAt.Unix(),
		parser.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update parser: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("parser not found: %s", parser.ID)
	}

	return nil
}

func (s *SQLiteStorage) DeleteParser(ctx context.Context, id string) error {
	query := `DELETE FROM parsers WHERE id = ?`

	result, err := s.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete parser: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("parser not found: %s", id)
	}

	return nil
}

func (s *SQLiteStorage) WriteDataPoints(ctx context.Context, points []models.DataPoint) error {
	if len(points) == 0 {
		return nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO data_points (session_id, device_id, timestamp, data)
		VALUES (?, ?, ?, ?)
	`)
	if err != nil {
		return fmt.Errorf("failed to prepare statement: %w", err)
	}
	defer stmt.Close()

	for _, point := range points {
		if _, err := stmt.ExecContext(ctx,
			point.SessionID,
			point.DeviceID,
			point.Timestamp,
			point.Data,
		); err != nil {
			return fmt.Errorf("failed to insert data point: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

func (s *SQLiteStorage) QueryData(ctx context.Context, sessionID string, deviceID string, start, end int64) ([]models.DataPoint, error) {
	query := `
		SELECT session_id, device_id, timestamp, data
		FROM data_points
		WHERE session_id = ? AND device_id = ? AND timestamp BETWEEN ? AND ?
		ORDER BY timestamp ASC
	`

	rows, err := s.db.QueryContext(ctx, query, sessionID, deviceID, start, end)
	if err != nil {
		return nil, fmt.Errorf("failed to query data: %w", err)
	}
	defer rows.Close()

	var points []models.DataPoint

	for rows.Next() {
		var point models.DataPoint

		if err := rows.Scan(
			&point.SessionID,
			&point.DeviceID,
			&point.Timestamp,
			&point.Data,
		); err != nil {
			return nil, fmt.Errorf("failed to scan data point: %w", err)
		}

		points = append(points, point)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating data points: %w", err)
	}

	return points, nil
}

func (s *SQLiteStorage) Close() error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: s, Valid: true}
}

func nullInt(i int) sql.NullInt64 {
	if i == 0 {
		return sql.NullInt64{Valid: false}
	}
	return sql.NullInt64{Int64: int64(i), Valid: true}
}
