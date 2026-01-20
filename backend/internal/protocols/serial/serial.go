package serial

import (
	"time"

	"go.bug.st/serial"
)

const (
	defaultBaudRate = 9600
	defaultDataBits = 8
	defaultParity   = "N"
	defaultStopBits = 1
)

type SerialConfig struct {
	Port     string
	BaudRate int
	DataBits int
	Parity   string
	StopBits int
	Timeout  time.Duration
}

func ParityModeFromString(s string) serial.Parity {
	switch s {
	case "N":
		return serial.NoParity
	case "O":
		return serial.OddParity
	case "E":
		return serial.EvenParity
	case "M":
		return serial.MarkParity
	case "S":
		return serial.SpaceParity
	default:
		return serial.NoParity
	}
}
