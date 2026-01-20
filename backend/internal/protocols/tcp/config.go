package tcp

import "time"

type TCPConfig struct {
	Address        string        `json:"address"`
	Timeout        time.Duration `json:"timeout"`
	ReadBufferSize int           `json:"readBufferSize"`
}

type TCPMetrics struct {
	BytesRead      int64     `json:"bytesRead"`
	BytesWritten   int64     `json:"bytesWritten"`
	ReadCount      int64     `json:"readCount"`
	WriteCount     int64     `json:"writeCount"`
	ErrorCount     int64     `json:"errorCount"`
	LastRead       time.Time `json:"lastRead"`
	LastWrite      time.Time `json:"lastWrite"`
	AverageLatency float64   `json:"averageLatency"`
}
