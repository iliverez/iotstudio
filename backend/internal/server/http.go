package server

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/iotstudio/iotstudio/internal/storage"
	"github.com/rs/zerolog"
)

type Server struct {
	httpServer *http.Server
	upgrader   websocket.Upgrader
	storage    storage.Storage
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
			return true // Allow all origins in development
		},
	}

	logger := zerolog.New(zerolog.ConsoleWriter{Out: log.Writer()}).With().Timestamp().Logger()

	return &Server{
		upgrader: upgrader,
		storage:  config.Storage,
		logger:   logger,
	}
}

func (s *Server) Start(ctx context.Context, addr string) error {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", s.healthCheck)
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/api/", s.handleAPI)

	s.httpServer = &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	s.logger.Info().Str("addr", addr).Msg("Starting server")

	err := make(chan error, 1)
	go func() {
		if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			err <- err
		}
	}()

	select {
	case <-ctx.Done():
		s.logger.Info().Msg("Shutting down server")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return s.httpServer.Shutdown(shutdownCtx)
	case e := <-err:
		return e
	}
}

func (s *Server) healthCheck(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func (s *Server) handleAPI(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("API endpoint"))
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
