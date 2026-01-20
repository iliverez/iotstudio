package models

import (
	"testing"
	"time"
)

func TestSessionValidation(t *testing.T) {
	tests := []struct {
		name    string
		session *Session
		wantErr bool
	}{
		{
			name: "Valid session",
			session: &Session{
				ID:        "test-123",
				Name:      "Test Session",
				Status:    "idle",
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
			wantErr: false,
		},
		{
			name: "Empty ID",
			session: &Session{
				ID:        "",
				Name:      "Test Session",
				Status:    "idle",
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
			wantErr: true,
		},
		{
			name: "Empty name",
			session: &Session{
				ID:        "test-123",
				Name:      "",
				Status:    "idle",
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.session.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Session.Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestDeviceValidation(t *testing.T) {
	tests := []struct {
		name    string
		device  *Device
		wantErr bool
	}{
		{
			name: "Valid device",
			device: &Device{
				ID:           "device-123",
				SessionID:    "session-123",
				ConnectionID: "conn-123",
				Address:      "1",
				Name:         "Test Device",
				CreatedAt:    time.Now(),
				UpdatedAt:    time.Now(),
			},
			wantErr: false,
		},
		{
			name: "Invalid address",
			device: &Device{
				ID:           "device-123",
				SessionID:    "session-123",
				ConnectionID: "conn-123",
				Address:      "255",
				Name:         "Test Device",
				CreatedAt:    time.Now(),
				UpdatedAt:    time.Now(),
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.device.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Device.Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
