package mock

import (
	"sync"
)

type MockSerialPort struct {
	mu        sync.RWMutex
	readBuf   []byte
	writeBuf  []byte
	connected bool
}

func New() *MockSerialPort {
	return &MockSerialPort{}
}

func (m *MockSerialPort) Read(p []byte) (n int, err error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if !m.connected {
		return 0, nil
	}

	n = copy(p, m.readBuf)

	if len(m.readBuf) >= n {
		m.readBuf = m.readBuf[n:]
	}

	return n, nil
}

func (m *MockSerialPort) Write(p []byte) (n int, err error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if len(p) == 0 {
		return 0, nil
	}

	if !m.connected {
		return 0, nil
	}

	m.writeBuf = append(m.writeBuf, p...)

	return len(p), nil
}

func (m *MockSerialPort) Flush() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.readBuf = m.readBuf[:0]
	m.writeBuf = m.writeBuf[:0]

	return nil
}

func (m *MockSerialPort) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.connected = false
	return nil
}
