import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { devicesApi, parsersApi, monitoringSessionsApi, engineeringUnitsApi, sessionsApi } from '@/api/client'
import { useDashboardStore } from '@/stores/dashboardStore'
import type { Device, Parser, ModbusRegister, SignalConfig, AggregationType, RawDataPoint, AggregatedDataPoint, EngineeringUnit } from '@/types'
import './DeviceMonitor.css'

// Chart.js imports
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'
import { Line } from 'react-chartjs-2'
import 'chartjs-adapter-date-fns'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
  zoomPlugin
)

interface DeviceMonitorProps {
  device: Device
  connectionStatus: string
  sessionId: string
  onClose: () => void
}

function aggregateValue(samples: RawDataPoint[], signalName: string, aggregation: AggregationType): unknown {
  if (samples.length === 0) return null
  
  const values = samples
    .map(s => s.data[signalName])
    .filter(v => v !== null && v !== undefined && typeof v === 'number')
    .map(v => Number(v))
  
  if (values.length === 0) return null
  
  switch (aggregation) {
    case 'average':
      return values.reduce((a, b) => a + b, 0) / values.length
    case 'max':
      return Math.max(...values)
    case 'min':
      return Math.min(...values)
    case 'last':
      return values[values.length - 1]
    default:
      return values.reduce((a, b) => a + b, 0) / values.length
  }
}

export function DeviceMonitor({ device, connectionStatus, sessionId, onClose }: DeviceMonitorProps) {
  const updateSession = useDashboardStore((state) => state.updateSession)
  const [parser, setParser] = useState<Parser | null>(null)
  const [loading, setLoading] = useState(true)
  const [monitoring, setMonitoring] = useState(false)
  const [samplingPeriod, setSamplingPeriod] = useState(1000) // Default 1 second
  const [loggingPeriod, setLoggingPeriod] = useState(5000) // Default 5 seconds
  const [defaultAggregation, setDefaultAggregation] = useState<AggregationType>('average')
  const [aggregatedDataPoints, setAggregatedDataPoints] = useState<AggregatedDataPoint[]>([])
  const [signalConfigs, setSignalConfigs] = useState<SignalConfig[]>([])
  const [currentValues, setCurrentValues] = useState<Record<string, unknown>>({})
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'graph'>('graph')
  const [showConfigPanel, setShowConfigPanel] = useState(false)
  const [sessionName, setSessionName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [savingSession, setSavingSession] = useState(false)
  const [engineeringUnits, setEngineeringUnits] = useState<EngineeringUnit[]>([])
  const [sessionComments, setSessionComments] = useState('')
  const [rightAxisSignal, setRightAxisSignal] = useState<string>('')
  
  // Internal state for aggregation
  const pendingSamples = useRef<RawDataPoint[]>([])
  const lastPeriodEnd = useRef<number>(0)
  
  const chartRef = useRef<ChartJS<'line'>>(null)
  const monitorStartTime = useRef<number>(0)
  const monitorEndTime = useRef<number>(0)

  const isConnected = connectionStatus === 'connected'

  useEffect(() => {
    const loadParser = async () => {
      if (device.parserId) {
        try {
          const response = await parsersApi.get(device.parserId)
          setParser(response.data)
          
          // Initialize signal configs based on parser fields/registers
          const registers = response.data.type === 'modbus' && response.data.modbusRegisters 
            ? response.data.modbusRegisters 
            : []
          const fields = response.data.type === 'visual' ? response.data.fields : []
          
          const configs: SignalConfig[] = []
          
          if (registers.length > 0) {
            registers.forEach((reg: ModbusRegister) => {
              configs.push({
                name: reg.name,
                loggingPeriod: 5000,
                aggregation: 'average',
                engineeringUnitId: reg.engineeringUnitId,
              })
            })
          } else if (fields.length > 0) {
            fields.forEach((field: { name: string; engineeringUnitId?: string }) => {
              configs.push({
                name: field.name,
                loggingPeriod: 5000,
                aggregation: 'average',
                engineeringUnitId: field.engineeringUnitId,
              })
            })
          }
          
          setSignalConfigs(configs)
          
          // Auto-select signals with different units for right axis
          if (configs.length > 1) {
            const units = new Set(configs.map(c => c.engineeringUnitId).filter(Boolean))
            if (units.size > 1) {
              // Find first signal with different unit than first signal
              const firstUnit = configs[0].engineeringUnitId
              const rightAxisSignal = configs.find(c => c.engineeringUnitId && c.engineeringUnitId !== firstUnit)
              if (rightAxisSignal) {
                setRightAxisSignal(rightAxisSignal.name)
              }
            }
          }
        } catch (err) {
          console.error('Failed to load parser:', err)
        }
      }
      setLoading(false)
    }
    loadParser()
    loadEngineeringUnits()
  }, [device.parserId])

  const loadEngineeringUnits = async () => {
    try {
      const response = await engineeringUnitsApi.list()
      setEngineeringUnits(response.data)
    } catch (err) {
      console.error('Failed to load engineering units:', err)
    }
  }

  // Process aggregation - called on each device read
  const processAggregation = useCallback((dataPointData: Record<string, unknown>) => {
    const timestamp = Date.now()
    
    // Add current sample to pending
    const rawPoint: RawDataPoint = {
      timestamp,
      data: dataPointData || {},
    }
    pendingSamples.current.push(rawPoint)
    
    // Calculate current period boundary
    const periodEnd = Math.floor(timestamp / loggingPeriod) * loggingPeriod
    
    // Check if we've crossed a period boundary
    if (periodEnd > lastPeriodEnd.current) {
      // Get samples from the completed period
      const periodSamples = pendingSamples.current.filter(
        s => s.timestamp > lastPeriodEnd.current && s.timestamp <= periodEnd
      )
      
      if (periodSamples.length > 0) {
        // Aggregate ALL signals into a single data point
        const aggregatedData: Record<string, unknown> = {}
        
        for (const config of signalConfigs) {
          const value = aggregateValue(periodSamples, config.name, config.aggregation)
          aggregatedData[config.name] = value
        }
        
        // Create single aggregated data point with all signals
        const aggPoint: AggregatedDataPoint = {
          timestamp: periodEnd,
          periodStart: lastPeriodEnd.current,
          periodEnd: periodEnd,
          data: aggregatedData,
        }
        
        setAggregatedDataPoints(prev => [...prev, aggPoint].slice(-5000))
        
        // Keep only samples from current period for next aggregation
        pendingSamples.current = pendingSamples.current.filter(
          s => s.timestamp > periodEnd
        )
      }
      
      lastPeriodEnd.current = periodEnd
    }
  }, [loggingPeriod, signalConfigs])

  const readDevice = useCallback(async () => {
    if (!isConnected) {
      setError('Connection is not established')
      return
    }

    try {
      const response = await devicesApi.read(device.id)
      const dataPoint = response.data
      
      setCurrentValues(dataPoint.data || {})
      setLastUpdate(new Date())
      
      // Only clear error on successful read
      if (error) {
        setError(null)
      }
      
      // Process aggregation with the new data point
      processAggregation(dataPoint.data || {})
    } catch (err: any) {
      console.error('Failed to read device:', err)
      setError(err.response?.data?.error || err.message || 'Failed to read device')
    }
  }, [device.id, isConnected, processAggregation, error])

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null

    if (monitoring && isConnected) {
      readDevice() // Initial read
      intervalId = setInterval(readDevice, samplingPeriod)
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [monitoring, samplingPeriod, readDevice, isConnected])

  const handleStartMonitoring = async () => {
    setAggregatedDataPoints([])
    pendingSamples.current = []
    lastPeriodEnd.current = 0
    setCurrentValues({})
    monitorStartTime.current = Date.now()
    setMonitoring(true)
    
    // Update session status to running
    updateSession(sessionId, { status: 'running' })
    
    try {
      await sessionsApi.update(sessionId, { status: 'running' })
    } catch (err) {
      console.error('Failed to update session status:', err)
    }
  }

  const handleStopMonitoring = async () => {
    setMonitoring(false)
    monitorEndTime.current = Date.now()
    
    // Update session status to idle
    updateSession(sessionId, { status: 'idle' })
    
    try {
      await sessionsApi.update(sessionId, { status: 'idle' })
    } catch (err) {
      console.error('Failed to update session status:', err)
    }
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

  const handleSignalConfigChange = (signalName: string, field: 'loggingPeriod' | 'aggregation', value: number | AggregationType) => {
    setSignalConfigs(prev => prev.map(s => 
      s.name === signalName 
        ? { ...s, [field]: value }
        : s
    ))
  }

  const handleSaveSession = async () => {
    if (!sessionName.trim()) {
      setError('Please enter a session name')
      return
    }

    setSavingSession(true)
    try {
      await monitoringSessionsApi.create({
        name: sessionName,
        deviceId: device.id,
        samplingPeriod,
        defaultLoggingPeriod: loggingPeriod,
        defaultAggregation,
        signalConfigs: signalConfigs,
        startTime: monitorStartTime.current,
        endTime: Date.now(),
        dataPoints: aggregatedDataPoints,
        rawDataPoints: [],
        comments: sessionComments,
        createdAt: new Date().toISOString(),
      } as any)
      setShowSaveDialog(false)
      setSessionName('')
      setSessionComments('')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save monitoring session')
    } finally {
      setSavingSession(false)
    }
  }

  const resetZoom = () => {
    if (chartRef.current) {
      chartRef.current.resetZoom()
    }
  }

  // Prepare chart data - only uses aggregated data points
  const chartData = useMemo(() => {
    const points = aggregatedDataPoints
    if (points.length === 0) return null

    const signalKeys = signalConfigs.map(s => s.name)
    const datasets = signalKeys.map((key, index) => {
      const colors = [
        { border: '#36a2eb', background: 'rgba(54, 162, 235, 0.1)' },
        { border: '#ff6384', background: 'rgba(255, 99, 132, 0.1)' },
        { border: '#4bc0c0', background: 'rgba(75, 192, 192, 0.1)' },
        { border: '#ff9f40', background: 'rgba(255, 159, 64, 0.1)' },
        { border: '#9966ff', background: 'rgba(153, 102, 255, 0.1)' },
        { border: '#c9cbcf', background: 'rgba(201, 203, 207, 0.1)' },
      ]
      const color = colors[index % colors.length]
      
      // Determine which y-axis to use based on rightAxisSignal selection
      const useRightAxis = rightAxisSignal === key

      return {
        label: key,
        data: points.map(point => ({
          x: point.timestamp,
          y: point.data[key] !== undefined ? Number(point.data[key]) : null,
        })),
        borderColor: color.border,
        backgroundColor: color.background,
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        yAxisID: useRightAxis ? 'y1' : 'y',
      }
    })

    return { datasets }
  }, [aggregatedDataPoints, signalConfigs, rightAxisSignal])

  const chartOptions = useMemo(() => {
    const hasRightAxis = rightAxisSignal !== ''
    const leftAxisConfig = signalConfigs.find(s => s.name !== rightAxisSignal)
    const rightAxisConfig = signalConfigs.find(s => s.name === rightAxisSignal)

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
          labels: {
            color: '#888',
            font: { size: 11 },
          },
        },
        tooltip: {
          backgroundColor: '#333',
          titleColor: '#fff',
          bodyColor: '#ccc',
          borderColor: '#444',
          borderWidth: 1,
        },
        zoom: {
          pan: { enabled: true, mode: 'x' as const },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'x' as const,
          },
        },
      },
      scales: {
        x: {
          type: 'time' as const,
          time: {
            displayFormats: {
              millisecond: 'HH:mm:ss.SSS',
              second: 'HH:mm:ss',
              minute: 'HH:mm',
              hour: 'HH:mm',
            },
          },
          ticks: { color: '#888', font: { size: 10 } },
          grid: { color: '#333' },
        },
        y: {
          position: 'left' as const,
          ticks: { color: '#888', font: { size: 10 } },
          grid: { color: '#333' },
          title: {
            display: true,
            text: leftAxisConfig?.engineeringUnitId 
              ? engineeringUnits.find(e => e.id === leftAxisConfig?.engineeringUnitId)?.symbol || leftAxisConfig?.name || ''
              : leftAxisConfig?.name || '',
            color: '#888',
          },
        },
        y1: {
          display: hasRightAxis,
          position: 'right' as const,
          ticks: { color: '#888', font: { size: 10 } },
          grid: { drawOnChartArea: false },
          title: {
            display: hasRightAxis,
            text: rightAxisConfig?.engineeringUnitId
              ? engineeringUnits.find(e => e.id === rightAxisConfig?.engineeringUnitId)?.symbol || rightAxisConfig?.name || ''
              : rightAxisConfig?.name || '',
            color: '#888',
          },
        },
      },
      interaction: { intersect: false, mode: 'index' as const },
    }
  }, [signalConfigs, engineeringUnits, rightAxisSignal])

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
          <div className="header-actions">
            <button 
              className="btn btn-secondary"
              onClick={() => setShowConfigPanel(!showConfigPanel)}
            >
              ⚙ Config
            </button>
            <button className="btn-icon" onClick={onClose}>×</button>
          </div>
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

          {/* Configuration Panel */}
          {showConfigPanel && (
            <div className="config-panel">
              <h3>Monitoring Configuration</h3>
              
              <div className="config-grid">
                <div className="config-item">
                  <label htmlFor="sampling-period">Sampling Period (ms):</label>
                  <input
                    id="sampling-period"
                    type="number"
                    value={samplingPeriod}
                    onChange={(e) => setSamplingPeriod(Math.max(100, parseInt(e.target.value) || 1000))}
                    min="100"
                    step="100"
                    disabled={monitoring}
                  />
                  <span className="config-hint">How often to read the device</span>
                </div>

                <div className="config-item">
                  <label htmlFor="logging-period">Logging Period (ms):</label>
                  <input
                    id="logging-period"
                    type="number"
                    value={loggingPeriod}
                    onChange={(e) => setLoggingPeriod(Math.max(samplingPeriod, parseInt(e.target.value) || 5000))}
                    min={samplingPeriod}
                    step="100"
                    disabled={monitoring}
                  />
                  <span className="config-hint">Time window for aggregation</span>
                </div>

                <div className="config-item">
                  <label htmlFor="default-aggregation">Default Aggregation:</label>
                  <select
                    id="default-aggregation"
                    value={defaultAggregation}
                    onChange={(e) => setDefaultAggregation(e.target.value as AggregationType)}
                    disabled={monitoring}
                  >
                    <option value="average">Average</option>
                    <option value="max">Max</option>
                    <option value="min">Min</option>
                    <option value="last">Last</option>
                  </select>
                  <span className="config-hint">How to combine samples</span>
                </div>
              </div>

              {/* Signal-specific configuration */}
              {signalConfigs.length > 0 && (
                <div className="signal-configs">
                  <h4>Signal Configuration</h4>
                  <table className="signal-config-table">
                    <thead>
                      <tr>
                        <th>Signal</th>
                        <th>Logging Period (ms)</th>
                        <th>Aggregation</th>
                        <th>Axis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {signalConfigs.map((signal) => (
                        <tr key={signal.name}>
                          <td>
                            {signal.name}
                            {signal.engineeringUnitId && (
                              <span className="unit-badge">
                                {engineeringUnits.find(e => e.id === signal.engineeringUnitId)?.symbol || signal.engineeringUnitId}
                              </span>
                            )}
                          </td>
                          <td>
                            <input
                              type="number"
                              value={signal.loggingPeriod}
                              onChange={(e) => handleSignalConfigChange(signal.name, 'loggingPeriod', Math.max(samplingPeriod, parseInt(e.target.value) || samplingPeriod))}
                              min={samplingPeriod}
                              step="100"
                              disabled={monitoring}
                            />
                          </td>
                          <td>
                            <select
                              value={signal.aggregation}
                              onChange={(e) => handleSignalConfigChange(signal.name, 'aggregation', e.target.value as AggregationType)}
                              disabled={monitoring}
                            >
                              <option value="average">Average</option>
                              <option value="max">Max</option>
                              <option value="min">Min</option>
                              <option value="last">Last</option>
                            </select>
                          </td>
                          <td>
                            <select
                              value={rightAxisSignal === signal.name ? 'right' : 'left'}
                              onChange={(e) => setRightAxisSignal(e.target.value === 'right' ? signal.name : '')}
                            >
                              <option value="left">Left</option>
                              <option value="right">Right</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
              
              {/* Show save button when there's data, regardless of monitoring state */}
              {aggregatedDataPoints.length > 0 && !monitoring && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowSaveDialog(true)}
                >
                  💾 Save Session
                </button>
              )}
            </div>

            <div className="stats">
              <span className="stat">
                Logged: {aggregatedDataPoints.length}
              </span>
            </div>

            {lastUpdate && (
              <div className="last-update">
                Last update: {lastUpdate.toLocaleTimeString()}
              </div>
            )}
          </div>

          {/* Data History */}
          {aggregatedDataPoints.length > 0 && (
            <div className="data-history">
              <div className="data-history-header">
                <h3>
                  Data History ({aggregatedDataPoints.length} logged points)
                </h3>
                <div className="view-controls">
                  {viewMode === 'graph' && (
                    <button className="btn btn-small" onClick={resetZoom}>
                      Reset Zoom
                    </button>
                  )}
                  <div className="view-toggle">
                    <button
                      className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                      onClick={() => setViewMode('table')}
                      title="Table View"
                    >
                      Table
                    </button>
                    <button
                      className={`toggle-btn ${viewMode === 'graph' ? 'active' : ''}`}
                      onClick={() => setViewMode('graph')}
                      title="Graph View"
                    >
                      Graph
                    </button>
                  </div>
                </div>
              </div>

              {viewMode === 'table' ? (
                <div className="history-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        {signalConfigs.map(s => (
                          <th key={s.name}>{s.name} ({s.aggregation})</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {aggregatedDataPoints.slice(0, 100).map((point, index) => (
                        <tr key={index}>
                          <td>{new Date(point.timestamp).toLocaleTimeString()}</td>
                          {signalConfigs.map(s => (
                            <td key={s.name}>{formatValue(point.data[s.name])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="history-chart">
                  {chartData && (
                    <Line ref={chartRef} data={chartData} options={chartOptions} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save Dialog */}
        {showSaveDialog && (
          <div className="modal-overlay" onClick={() => setShowSaveDialog(false)}>
            <div className="modal-content modal-small" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Save Monitoring Session</h3>
                <button className="btn-icon" onClick={() => setShowSaveDialog(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="session-name">Session Name:</label>
                  <input
                    id="session-name"
                    type="text"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="Enter a name for this session"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="session-comments">Comments:</label>
                  <textarea
                    id="session-comments"
                    value={sessionComments}
                    onChange={(e) => setSessionComments(e.target.value)}
                    placeholder="Add notes about this monitoring session"
                    rows={3}
                  />
                </div>
                <div className="session-stats">
                  <p>Aggregated data points: {aggregatedDataPoints.length}</p>
                  <p>Duration: {monitorStartTime.current > 0 ?
                    `${Math.round(((monitorEndTime.current || Date.now()) - monitorStartTime.current) / 1000)}s` : 'N/A'}</p>
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setShowSaveDialog(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleSaveSession}
                  disabled={savingSession || !sessionName.trim()}
                >
                  {savingSession ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
