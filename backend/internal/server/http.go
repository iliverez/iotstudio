package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/iotstudio/iotstudio/internal/connections"
	"github.com/iotstudio/iotstudio/internal/models"
	"github.com/iotstudio/iotstudio/internal/storage"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog"
)

type Server struct {
	httpServer *http.Server
	upgrader   websocket.Upgrader
	storage    storage.Storage
	connMgr    *connections.ConnectionManager
	logger     zerolog.Logger
}

type ServerConfig struct {
	Addr    string
	Storage storage.Storage
}

func NewServer(config ServerConfig) *Server {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}

	logger := zerolog.New(zerolog.ConsoleWriter{Out: log.Writer()}).With().Timestamp().Logger()

	return &Server{
		upgrader: upgrader,
		storage:  config.Storage,
		connMgr: connections.NewConnectionManager(connections.Config{
			Storage: config.Storage,
		}),
		logger: logger,
	}
}

func (s *Server) Start(ctx context.Context, addr string) error {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/api/sessions/", s.handleSessionConnections)
	mux.HandleFunc("/api/sessions", s.handleSessions)
	mux.HandleFunc("/api/connections/", s.handleConnections)
	mux.HandleFunc("/api/connections", s.handleConnections)
	mux.HandleFunc("/api/devices/", s.handleDevices)
	mux.HandleFunc("/api/devices", s.handleDevices)
	mux.HandleFunc("/api/", s.handleDeviceMonitoringSessions) // For /api/devices/{id}/monitoring-sessions
	mux.HandleFunc("/api/parsers", s.handleParsers)
	mux.HandleFunc("/api/parsers/", s.handleParsers)
	mux.HandleFunc("/api/monitoring-sessions", s.handleMonitoringSessions)
	mux.HandleFunc("/api/monitoring-sessions/", s.handleMonitoringSessions)
	mux.HandleFunc("/api/engineering-units", s.handleEngineeringUnits)
	mux.HandleFunc("/api/engineering-units/", s.handleEngineeringUnits)

	s.httpServer = &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	s.logger.Info().Str("addr", addr).Msg("Starting server")

	serverErr := make(chan error, 1)
	go func() {
		if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			serverErr <- err
		}
	}()

	select {
	case <-ctx.Done():
		s.logger.Info().Msg("Shutting down server")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return s.httpServer.Shutdown(shutdownCtx)
	case e := <-serverErr:
		return e
	}
}

func (s *Server) healthCheck(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func extractIDFromPath(path, prefix string) string {
	if len(path) <= len(prefix) {
		return ""
	}
	id := path[len(prefix):]
	slashIdx := strings.Index(id, "/")
	if slashIdx != -1 {
		id = id[:slashIdx]
	}
	return id
}

func (s *Server) handleSessions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	id := extractIDFromPath(r.URL.Path, "/api/sessions/")

	switch r.Method {
	case "GET":
		if id != "" {
			session, err := s.storage.GetSession(r.Context(), id)
			if err != nil {
				w.WriteHeader(http.StatusNotFound)
				w.Write([]byte(`{"error": "Session not found"}`))
				return
			}
			json.NewEncoder(w).Encode(session)
		} else {
			sessions, err := s.storage.ListSessions(r.Context())
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
				return
			}
			json.NewEncoder(w).Encode(sessions)
		}

	case "POST":
		var session models.Session
		if err := json.NewDecoder(r.Body).Decode(&session); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Invalid request body"}`))
			return
		}
		session.ID = uuid.New().String()
		session.CreatedAt = time.Now()
		session.Status = "idle"

		if err := s.storage.CreateSession(r.Context(), &session); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(session)

	case "PUT":
		if id == "" {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Session ID is required"}`))
			return
		}

		var session models.Session
		if err := json.NewDecoder(r.Body).Decode(&session); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Invalid request body"}`))
			return
		}
		session.ID = id

		if err := s.storage.UpdateSession(r.Context(), &session); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
			return
		}
		json.NewEncoder(w).Encode(session)

	case "DELETE":
		if id == "" {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Session ID is required"}`))
			return
		}

		if err := s.storage.DeleteSession(r.Context(), id); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Server) handleSessionConnections(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	sessionID := extractIDFromPath(r.URL.Path, "/api/sessions/")
	if sessionID == "" {
		s.handleSessions(w, r)
		return
	}

	pathSuffix := strings.TrimPrefix(r.URL.Path, "/api/sessions/"+sessionID)

	if pathSuffix == "" || pathSuffix == "/" {
		s.handleSessions(w, r)
		return
	}

	if pathSuffix == "/connections" {
		switch r.Method {
		case "GET":
			connections, err := s.storage.ListConnectionsBySession(r.Context(), sessionID)
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
				return
			}
			json.NewEncoder(w).Encode(connections)

		case "POST":
			var connection models.Connection
			if err := json.NewDecoder(r.Body).Decode(&connection); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				w.Write([]byte(`{"error": "Invalid request body"}`))
				return
			}
			connection.ID = uuid.New().String()
			connection.SessionID = sessionID
			connection.CreatedAt = time.Now()
			connection.UpdatedAt = time.Now()
			connection.Status = "disconnected"

			if err := s.storage.CreateConnection(r.Context(), &connection); err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
				return
			}
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(connection)

		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}

	if strings.HasPrefix(pathSuffix, "/connections/") {
		restOfPath := strings.TrimPrefix(pathSuffix, "/connections/")
		if strings.HasSuffix(restOfPath, "/devices") {
			connectionID := strings.TrimSuffix(restOfPath, "/devices")
			r.URL.Path = "/api/connections/" + connectionID + "/devices"
			s.handleDevices(w, r)
			return
		}
	}

	if pathSuffix == "/devices" {
		s.handleDevices(w, r)
		return
	}

	w.WriteHeader(http.StatusNotFound)
	w.Write([]byte(`{"error": "Not found"}`))
}

func (s *Server) handleConnections(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	id := extractIDFromPath(r.URL.Path, "/api/connections/")
	sessionID := extractIDFromPath(r.URL.Path, "/api/sessions/")

	if id != "" && strings.HasSuffix(r.URL.Path, "/devices") {
		connectionID := strings.TrimSuffix(id, "/devices")
		r.URL.Path = "/api/connections/" + connectionID + "/devices"
		s.handleDevices(w, r)
		return
	}

	// Handle connect/disconnect actions
	if r.Method == "POST" && id != "" {
		pathSuffix := strings.TrimPrefix(r.URL.Path, "/api/connections/"+id)

		if pathSuffix == "/connect" {
			// Load connection from storage
			conn, err := s.storage.GetConnection(r.Context(), id)
			if err != nil {
				w.WriteHeader(http.StatusNotFound)
				w.Write([]byte(`{"error": "Connection not found"}`))
				return
			}

			// Update status to connecting
			conn.Status = "connecting"
			if err := s.storage.UpdateConnection(r.Context(), conn); err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
				return
			}

			// Try to connect
			if err := s.connMgr.StartConnection(r.Context(), id); err != nil {
				conn.Status = "error"
				s.storage.UpdateConnection(r.Context(), conn)
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(fmt.Sprintf(`{"error": "Failed to connect: %s"}`, err.Error())))
				return
			}

			conn.Status = "connected"
			if err := s.storage.UpdateConnection(r.Context(), conn); err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
				return
			}

			json.NewEncoder(w).Encode(conn)
			return
		}

		if pathSuffix == "/disconnect" {
			// Load connection from storage
			conn, err := s.storage.GetConnection(r.Context(), id)
			if err != nil {
				w.WriteHeader(http.StatusNotFound)
				w.Write([]byte(`{"error": "Connection not found"}`))
				return
			}

			// Disconnect
			if err := s.connMgr.StopConnection(r.Context(), id); err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(fmt.Sprintf(`{"error": "Failed to disconnect: %s"}`, err.Error())))
				return
			}

			conn.Status = "disconnected"
			if err := s.storage.UpdateConnection(r.Context(), conn); err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
				return
			}

			json.NewEncoder(w).Encode(conn)
			return
		}
	}

	switch r.Method {
	case "GET":
		if id != "" {
			connection, err := s.storage.GetConnection(r.Context(), id)
			if err != nil {
				w.WriteHeader(http.StatusNotFound)
				w.Write([]byte(`{"error": "Connection not found"}`))
				return
			}
			json.NewEncoder(w).Encode(connection)
		} else if sessionID != "" {
			connections, err := s.storage.ListConnectionsBySession(r.Context(), sessionID)
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
				return
			}
			json.NewEncoder(w).Encode(connections)
		} else {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Session ID or Connection ID required"}`))
			return
		}

	case "POST":
		if sessionID == "" {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Session ID is required"}`))
			return
		}

		var connection models.Connection
		if err := json.NewDecoder(r.Body).Decode(&connection); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Invalid request body"}`))
			return
		}
		connection.ID = uuid.New().String()
		connection.SessionID = sessionID
		connection.CreatedAt = time.Now()
		connection.UpdatedAt = time.Now()
		connection.Status = "disconnected"

		if err := s.storage.CreateConnection(r.Context(), &connection); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(connection)

	case "PUT":
		if id == "" {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Connection ID is required"}`))
			return
		}

		var connection models.Connection
		if err := json.NewDecoder(r.Body).Decode(&connection); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Invalid request body"}`))
			return
		}
		connection.ID = id

		if err := s.storage.UpdateConnection(r.Context(), &connection); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
			return
		}
		json.NewEncoder(w).Encode(connection)

	case "DELETE":
		if id == "" {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Connection ID is required"}`))
			return
		}

		if err := s.storage.DeleteConnection(r.Context(), id); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Server) handleDevices(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	id := extractIDFromPath(r.URL.Path, "/api/devices/")
	sessionID := extractIDFromPath(r.URL.Path, "/api/sessions/")
	connectionID := extractIDFromPath(r.URL.Path, "/api/connections/")

	s.logger.Debug().Str("method", r.Method).Str("path", r.URL.Path).Str("id", id).Str("sessionID", sessionID).Str("connectionID", connectionID).Msg("handleDevices called")

	switch r.Method {
	case "GET":
		isConnectionDevices := strings.HasPrefix(r.URL.Path, "/api/connections/") && strings.HasSuffix(r.URL.Path, "/devices")
		isSessionDevices := strings.HasPrefix(r.URL.Path, "/api/sessions/") && strings.HasSuffix(r.URL.Path, "/devices")
		isDeviceRead := id != "" && strings.HasSuffix(r.URL.Path, "/read")

		// Handle device read endpoint
		if isDeviceRead && id != "" {
			device, err := s.storage.GetDevice(r.Context(), id)
			if err != nil {
				s.logger.Error().Err(err).Str("id", id).Msg("Device not found")
				w.WriteHeader(http.StatusNotFound)
				w.Write([]byte(`{"error": "Device not found"}`))
				return
			}

			// Get connection for this device
			conn, err := s.storage.GetConnection(r.Context(), device.ConnectionID)
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(fmt.Sprintf(`{"error": "Connection not found: %s"}`, err.Error())))
				return
			}

			if conn.Status != "connected" {
				w.WriteHeader(http.StatusBadRequest)
				w.Write([]byte(`{"error": "Connection is not established"}`))
				return
			}

			// Read data from the connection, passing the device's parser ID
			data, err := s.connMgr.ReadAndParse(r.Context(), device.ConnectionID, device.ParserID)
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(fmt.Sprintf(`{"error": "Failed to read device: %s"}`, err.Error())))
				return
			}

			// Extract the device data - the key could be device ID, parser ID, or "device"
			// We take the first available data if the expected keys don't match
			var deviceData map[string]interface{}
			if data[device.ID] != nil {
				deviceData = data[device.ID]
			} else if data[device.ParserID] != nil {
				deviceData = data[device.ParserID]
			} else if data["device"] != nil {
				deviceData = data["device"]
			} else {
				// Take the first available data
				for _, v := range data {
					deviceData = v
					break
				}
			}
			if deviceData == nil {
				deviceData = make(map[string]interface{})
			}

			response := map[string]interface{}{
				"sessionId": device.SessionID,
				"deviceId":  device.ID,
				"timestamp": time.Now().UnixMilli(),
				"data":      deviceData,
			}
			json.NewEncoder(w).Encode(response)
			return
		}

		if id != "" && !isConnectionDevices && !isSessionDevices && !isDeviceRead {
			device, err := s.storage.GetDevice(r.Context(), id)
			if err != nil {
				s.logger.Error().Err(err).Str("id", id).Msg("Device not found")
				w.WriteHeader(http.StatusNotFound)
				w.Write([]byte(`{"error": "Device not found"}`))
				return
			}
			json.NewEncoder(w).Encode(device)
		} else if isConnectionDevices && connectionID != "" {
			s.logger.Debug().Str("connectionID", connectionID).Msg("Listing devices by connection")
			_, err := s.storage.GetConnection(r.Context(), connectionID)
			if err != nil {
				s.logger.Error().Err(err).Str("connectionID", connectionID).Msg("Connection not found")
				w.WriteHeader(http.StatusNotFound)
				w.Write([]byte(fmt.Sprintf(`{"error": "Connection '%s' not found"}`, connectionID)))
				return
			}
			devices, err := s.storage.ListDevicesByConnection(r.Context(), connectionID)
			if err != nil {
				s.logger.Error().Err(err).Str("connectionID", connectionID).Msg("Failed to list devices by connection")
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
				return
			}
			s.logger.Debug().Int("deviceCount", len(devices)).Str("connectionID", connectionID).Msg("Devices listed successfully")
			json.NewEncoder(w).Encode(devices)
		} else if isSessionDevices && sessionID != "" {
			s.logger.Debug().Str("sessionID", sessionID).Msg("Listing devices by session")
			devices, err := s.storage.ListDevicesBySession(r.Context(), sessionID)
			if err != nil {
				s.logger.Error().Err(err).Str("sessionID", sessionID).Msg("Failed to list devices by session")
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
				return
			}
			s.logger.Debug().Int("deviceCount", len(devices)).Str("sessionID", sessionID).Msg("Devices listed successfully")
			json.NewEncoder(w).Encode(devices)
		} else {
			s.logger.Warn().Str("path", r.URL.Path).Msg("Invalid device request path")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Session ID, Connection ID, or Device ID required"}`))
			return
		}

	case "POST":
		if sessionID == "" {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Session ID is required"}`))
			return
		}

		var device models.Device
		if err := json.NewDecoder(r.Body).Decode(&device); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Invalid request body"}`))
			return
		}
		device.ID = uuid.New().String()
		device.SessionID = sessionID
		device.CreatedAt = time.Now()
		device.UpdatedAt = time.Now()

		if err := s.storage.CreateDevice(r.Context(), &device); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(device)

	case "PUT":
		if id == "" {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Device ID is required"}`))
			return
		}

		var device models.Device
		if err := json.NewDecoder(r.Body).Decode(&device); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Invalid request body"}`))
			return
		}
		device.ID = id

		if err := s.storage.UpdateDevice(r.Context(), &device); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
			return
		}
		json.NewEncoder(w).Encode(device)

	case "DELETE":
		if id == "" {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Device ID is required"}`))
			return
		}

		if err := s.storage.DeleteDevice(r.Context(), id); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Server) handleParsers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	id := extractIDFromPath(r.URL.Path, "/api/parsers/")

	switch r.Method {
	case "GET":
		if id != "" {
			parser, err := s.storage.GetParser(r.Context(), id)
			if err != nil {
				w.WriteHeader(http.StatusNotFound)
				w.Write([]byte(`{"error": "Parser not found"}`))
				return
			}
			json.NewEncoder(w).Encode(parser)
		} else {
			parsers, err := s.storage.ListParsers(r.Context())
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
				return
			}
			json.NewEncoder(w).Encode(parsers)
		}

	case "POST":
		var parser models.Parser
		if err := json.NewDecoder(r.Body).Decode(&parser); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Invalid request body"}`))
			return
		}
		parser.ID = uuid.New().String()
		parser.CreatedAt = time.Now()
		parser.UpdatedAt = time.Now()

		if err := s.storage.CreateParser(r.Context(), &parser); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(parser)

	case "PUT":
		if id == "" {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Parser ID is required"}`))
			return
		}

		var parser models.Parser
		if err := json.NewDecoder(r.Body).Decode(&parser); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Invalid request body"}`))
			return
		}
		parser.ID = id

		if err := s.storage.UpdateParser(r.Context(), &parser); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
			return
		}
		json.NewEncoder(w).Encode(parser)

	case "DELETE":
		if id == "" {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Parser ID is required"}`))
			return
		}

		if err := s.storage.DeleteParser(r.Context(), id); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		s.logger.Error().Err(err).Msg("Failed to upgrade connection")
		return
	}
	defer conn.Close()

	s.logger.Info().Msg("WebSocket client connected")

	for {
		messageType, p, err := conn.ReadMessage()
		if err != nil {
			s.logger.Error().Err(err).Msg("Failed to read message")
			break
		}

		s.logger.Info().Int("type", messageType).Bytes("message", p).Msg("Received message")

		if err := conn.WriteMessage(messageType, p); err != nil {
			s.logger.Error().Err(err).Msg("Failed to write message")
			break
		}
	}
}

func (s *Server) GetConnectionManager() *connections.ConnectionManager {
	return s.connMgr
}

func (s *Server) GetStorage() storage.Storage {
	return s.storage
}

func (s *Server) handleMonitoringSessions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	path := strings.TrimPrefix(r.URL.Path, "/api/monitoring-sessions")

	// List all monitoring sessions
	if r.Method == "GET" && (path == "" || path == "/") {
		sessions, err := s.storage.ListMonitoringSessions(r.Context())
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(sessions)
		return
	}

	// Get monitoring session by ID
	if r.Method == "GET" && strings.HasPrefix(path, "/") {
		id := strings.TrimPrefix(path, "/")
		session, err := s.storage.GetMonitoringSession(r.Context(), id)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Monitoring session not found"})
			return
		}
		json.NewEncoder(w).Encode(session)
		return
	}

	// Create monitoring session
	if r.Method == "POST" && (path == "" || path == "/") {
		var session models.MonitoringSession
		if err := json.NewDecoder(r.Body).Decode(&session); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request body"})
			return
		}

		session.ID = uuid.New().String()
		session.CreatedAt = time.Now()

		if err := s.storage.CreateMonitoringSession(r.Context(), &session); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(session)
		return
	}

	// Update monitoring session
	if r.Method == "PUT" && strings.HasPrefix(path, "/") {
		id := strings.TrimPrefix(path, "/")
		var session models.MonitoringSession
		if err := json.NewDecoder(r.Body).Decode(&session); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request body"})
			return
		}

		session.ID = id

		if err := s.storage.UpdateMonitoringSession(r.Context(), &session); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		json.NewEncoder(w).Encode(session)
		return
	}

	// Delete monitoring session
	if r.Method == "DELETE" && strings.HasPrefix(path, "/") {
		id := strings.TrimPrefix(path, "/")

		if err := s.storage.DeleteMonitoringSession(r.Context(), id); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusNoContent)
		return
	}

	w.WriteHeader(http.StatusNotFound)
	json.NewEncoder(w).Encode(map[string]string{"error": "Not found"})
}

// handleDeviceMonitoringSessions handles requests to /api/devices/{deviceId}/monitoring-sessions
func (s *Server) handleDeviceMonitoringSessions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	path := strings.TrimPrefix(r.URL.Path, "/api/devices/")
	parts := strings.Split(path, "/")

	if len(parts) < 2 || parts[1] != "monitoring-sessions" {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Not found"})
		return
	}

	deviceID := parts[0]

	if r.Method == "GET" {
		sessions, err := s.storage.ListMonitoringSessionsByDevice(r.Context(), deviceID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(sessions)
		return
	}

	w.WriteHeader(http.StatusMethodNotAllowed)
	json.NewEncoder(w).Encode(map[string]string{"error": "Method not allowed"})
}

// handleEngineeringUnits handles requests to /api/engineering-units
func (s *Server) handleEngineeringUnits(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	id := extractIDFromPath(r.URL.Path, "/api/engineering-units/")

	switch r.Method {
	case "GET":
		if id != "" {
			unit, err := s.storage.GetEngineeringUnit(r.Context(), id)
			if err != nil {
				w.WriteHeader(http.StatusNotFound)
				w.Write([]byte(`{"error": "Engineering unit not found"}`))
				return
			}
			json.NewEncoder(w).Encode(unit)
		} else {
			units, err := s.storage.ListEngineeringUnits(r.Context())
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
				return
			}
			json.NewEncoder(w).Encode(units)
		}

	case "POST":
		var unit models.EngineeringUnit
		if err := json.NewDecoder(r.Body).Decode(&unit); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Invalid request body"}`))
			return
		}
		unit.ID = uuid.New().String()
		unit.CreatedAt = time.Now()

		if err := s.storage.CreateEngineeringUnit(r.Context(), &unit); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(unit)

	case "PUT":
		if id == "" {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Engineering unit ID is required"}`))
			return
		}

		var unit models.EngineeringUnit
		if err := json.NewDecoder(r.Body).Decode(&unit); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Invalid request body"}`))
			return
		}
		unit.ID = id

		if err := s.storage.UpdateEngineeringUnit(r.Context(), &unit); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
			return
		}
		json.NewEncoder(w).Encode(unit)

	case "DELETE":
		if id == "" {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "Engineering unit ID is required"}`))
			return
		}

		if err := s.storage.DeleteEngineeringUnit(r.Context(), id); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())))
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
