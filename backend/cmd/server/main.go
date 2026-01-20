package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/iotstudio/iotstudio/internal/config"
	"github.com/iotstudio/iotstudio/internal/server"
	"github.com/iotstudio/iotstudio/internal/storage/sqlite"

	"github.com/rs/zerolog/log"
)

func main() {
	log.Info().Msg("Starting IoTStudio Backend")

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to load configuration")
	}

	log.Info().Str("db_path", cfg.Database.Path).Msg("Database path")

	storage, err := sqlite.NewSQLiteStorage(cfg.Database.Path)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create storage")
	}
	defer storage.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	srv := server.NewServer(server.ServerConfig{
		Addr:    cfg.Server.Addr,
		Storage: storage,
	})

	errChan := make(chan error, 1)
	go func() {
		if err := srv.Start(ctx, cfg.Server.Addr); err != nil {
			errChan <- err
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-errChan:
		log.Error().Err(err).Msg("Server error")
		os.Exit(1)
	case sig := <-sigChan:
		log.Info().Str("signal", sig.String()).Msg("Received signal, shutting down")
		cancel()
	}
}
