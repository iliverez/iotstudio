import { useState, useEffect, useCallback } from 'react'
import { devicesApi, parsersApi } from '@/api/client'
import type { Device, Parser, ModbusRegister, DataPoint } from '@/types'
import './DeviceMonitor.css'

interface DeviceMonitorProps {
  device: Device
  connectionStatus: string
  onClose: () => void
}

export function DeviceMonitor({ device, connectionStatus, onClose }: DeviceMonitorProps) {
  const [parser, setParser] = useState<Parser | null>(null)
  const [loading, setLoading] = useState(true)
  const [monitoring, setMonitoring] = useState(false)
  const [pollInterval, setPollInterval] = useState(5000) // Default 5 seconds
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([])
  const [currentValues, setCurrentValues] = useState<Record<string, unknown>>({})
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const isConnected = connectionStatus === 'connected'

  useEffect(() => {
    const loadParser = async () => {
      if (device.parserId) {
        try {
          const response = await parsersApi.get(device.parserId)
          setParser(response.data)
        } catch (err) {
          console.error('Failed to load parser:', err)
        }
      }
      setLoading(false)
    }
    loadParser()
  }, [device.parserId])

  const readDevice = useCallback(async () => {
    if (!isConnected) {
      setError('Connection is not established')
      return
    }

    try {
      setError(null)
      const response = await devicesApi.read(device.id)
      const dataPoint = response.data
      
      setCurrentValues(dataPoint.data || {})
      setLastUpdate(new Date())
      
      setDataPoints((prev) => {
        const newPoints = [dataPoint, ...prev].slice(0, 100) // Keep last 100 points
        return newPoints
      })
    } catch (err: any) {
      console.error('Failed to read device:', err)
      setError(err.response?.data?.error || err.message || 'Failed to read device')
    }
  }, [device.id, isConnected])

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null

    if (monitoring && isConnected) {
      readDevice() // Initial read
      intervalId = setInterval(readDevice, pollInterval)
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [monitoring, pollInterval, readDevice, isConnected])

  const handleStartMonitoring = () => {
    setMonitoring(true)
    setDataPoints([])
    setCurrentValues({})
  }

  const handleStopMonitoring = () => {
    setMonitoring(false)
  }

  const handleManualRead = () => {
    readDevice()
  }

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'N/A'
    if (typeof value === 'number') {
      return value.toFixed(2)
    }
    return String(value)
  }

  const getRegisters = (): ModbusRegister[] => {
    if (parser?.type === 'modbus' && parser.modbusRegisters) {
      return parser.modbusRegisters
    }
    return []
  }

  const registers = getRegisters()

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Device Monitor</h2>
            <button className="btn-icon" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            <div className="loading-state">Loading...</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large device-monitor" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="monitor-header-info">
            <h2>{device.name}</h2>
            <span className={`status status-${connectionStatus}`}>
              {connectionStatus}
            </span>
          </div>
          <button className="btn-icon" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {!isConnected && (
            <div className="warning-banner">
              Connection is not established. Please connect the connection first.
            </div>
          )}

          {error && (
            <div className="error-banner">
              {error}
              <button className="btn-icon" onClick={() => setError(null)}>×</button>
            </div>
          )}

          {/* Parser/Registers Info */}
          <div className="registers-section">
            <h3>
              {parser?.type === 'modbus' ? 'Modbus Registers' : 'Parser Fields'}
              {parser && <span className="parser-name">({parser.name})</span>}
            </h3>
            
            {!parser && (
              <p className="no-parser">No parser assigned to this device</p>
            )}

            {parser && registers.length > 0 && (
              <div className="registers-table">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Address</th>
                      <th>Data Type</th>
                      <th>Current Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registers.map((reg, index) => (
                      <tr key={index}>
                        <td>{reg.name}</td>
                        <td>
                          <span className="register-type-badge">
                            {reg.registerType.replace('_', ' ')}
                          </span>
                        </td>
                        <td>{reg.address}</td>
                        <td>{reg.dataType}</td>
                        <td className="value-cell">
                          {formatValue(currentValues[reg.name])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {parser?.type === 'visual' && parser.fields.length > 0 && (
              <div className="registers-table">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Data Type</th>
                      <th>Offset</th>
                      <th>Current Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parser.fields.map((field, index) => (
                      <tr key={index}>
                        <td>{field.name}</td>
                        <td>{field.dataType}</td>
                        <td>{field.offset}</td>
                        <td className="value-cell">
                          {formatValue(currentValues[field.name])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Monitoring Controls */}
          <div className="monitoring-controls">
            <div className="poll-interval">
              <label htmlFor="poll-interval">Poll Interval (ms):</label>
              <input
                id="poll-interval"
                type="number"
                value={pollInterval}
                onChange={(e) => setPollInterval(Math.max(100, parseInt(e.target.value) || 5000))}
                min="100"
                step="100"
                disabled={monitoring}
              />
            </div>

            <div className="control-buttons">
              {!monitoring ? (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={handleStartMonitoring}
                    disabled={!isConnected}
                  >
                    ▶ Start Monitoring
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={handleManualRead}
                    disabled={!isConnected}
                  >
                    Read Once
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-danger"
                  onClick={handleStopMonitoring}
                >
                  ⏹ Stop Monitoring
                </button>
              )}
            </div>

            {lastUpdate && (
              <div className="last-update">
                Last update: {lastUpdate.toLocaleTimeString()}
              </div>
            )}
          </div>

          {/* Data History */}
          {dataPoints.length > 0 && (
            <div className="data-history">
              <h3>Data History ({dataPoints.length} points)</h3>
              <div className="history-table">
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      {Object.keys(dataPoints[0]?.data || {}).map((key) => (
                        <th key={key}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataPoints.slice(0, 20).map((point, index) => (
                      <tr key={index}>
                        <td>{new Date(point.timestamp).toLocaleTimeString()}</td>
                        {Object.entries(point.data || {}).map(([key, value]) => (
                          <td key={key}>{formatValue(value)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
