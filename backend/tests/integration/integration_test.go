package integration

import (
	"context"
	"testing"

	"github.com/iotstudio/iotstudio/internal/storage/sqlite"
)

func TestSQLiteStorage(t *testing.T) {
	ctx := context.Background()

	storage, err := sqlite.NewSQLiteStorage(":memory:")
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}
	defer storage.Close()

	session := struct {
		ID     string
		Name   string
		Status string
	}{
		ID:     "test-session-1",
		Name:   "Test Session",
		Status: "idle",
	}

	if err := storage.CreateSession(ctx, &session); err != nil {
		t.Fatalf("Failed to create session: %v", err)
	}
}
