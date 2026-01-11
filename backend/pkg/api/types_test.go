package api

import (
	"testing"
)

func TestConnectionTypeString(t *testing.T) {
	tests := []struct {
		name string
		ct   ConnectionType
		want string
	}{
		{"ModbusTCP", ModbusTCP, "modbus_tcp"},
		{"ModbusRTU", ModbusRTU, "modbus_rtu"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := string(tt.ct); got != tt.want {
				t.Errorf("ConnectionType string = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestConnectionStatusString(t *testing.T) {
	tests := []struct {
		name string
		cs   ConnectionStatus
		want string
	}{
		{"Disconnected", StatusDisconnected, "disconnected"},
		{"Connecting", StatusConnecting, "connecting"},
		{"Connected", StatusConnected, "connected"},
		{"Error", StatusError, "error"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := string(tt.cs); got != tt.want {
				t.Errorf("ConnectionStatus string = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSessionStatusString(t *testing.T) {
	tests := []struct {
		name string
		ss   SessionStatus
		want string
	}{
		{"Idle", SessionIdle, "idle"},
		{"Running", SessionRunning, "running"},
		{"Paused", SessionPaused, "paused"},
		{"Error", SessionError, "error"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := string(tt.ss); got != tt.want {
				t.Errorf("SessionStatus string = %v, want %v", got, tt.want)
			}
		})
	}
}
