package models

import (
	"errors"
	"strings"
	//"time"
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
	return nil
}
