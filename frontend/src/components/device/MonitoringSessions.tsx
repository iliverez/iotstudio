import { useState, useEffect, useMemo, useRef } from 'react'
import { monitoringSessionsApi, devicesApi, engineeringUnitsApi } from '@/api/client'
import type { MonitoringSession, Device, EngineeringUnit } from '@/types'
import './MonitoringSessions.css'

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
  ChartOptions,
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

interface MonitoringSessionsProps {
  onClose: () => void
  onViewSession?: (session: MonitoringSession) => void
}

export function MonitoringSessions({ onClose, onViewSession }: MonitoringSessionsProps) {
  const [sessions, setSessions] = useState<MonitoringSession[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSession, setSelectedSession] = useState<MonitoringSession | null>(null)
  const [devices, setDevices] = useState<Record<string, Device>>({})
  const [engineeringUnits, setEngineeringUnits] = useState<Record<string, EngineeringUnit>>({})
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'graph'>('graph')
  const chartRef = useRef<any>(null)
  const [leftYAxisSignal, setLeftYAxisSignal] = useState<string>('')
  const [rightYAxisSignal, setRightYAxisSignal] = useState<string>('')

  useEffect(() => {
    loadSessions()
    loadEngineeringUnits()
  }, [])

  const loadEngineeringUnits = async () => {
    try {
      const response = await engineeringUnitsApi.list()
      const unitMap: Record<string, EngineeringUnit> = {}
      response.data.forEach(unit => {
        unitMap[unit.id] = unit
      })
      setEngineeringUnits(unitMap)
    } catch (err) {
      console.error('Failed to load engineering units:', err)
    }
  }

  const loadSessions = async () => {
    try {
      setLoading(true)
      const response = await monitoringSessionsApi.list()
      setSessions(response.data)
      
      // Load device info for each session
      const deviceIds = [...new Set(response.data.map(s => s.deviceId))]
      const deviceMap: Record<string, Device> = {}
      for (const deviceId of deviceIds) {
        try {
          const deviceResponse = await devicesApi.get(deviceId)
          deviceMap[deviceId] = deviceResponse.data
        } catch {
          // Device might have been deleted
        }
      }
      setDevices(deviceMap)
    } catch (err: any) {
      setError(err.message || 'Failed to load monitoring sessions')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this monitoring session?')) {
      return
    }

    try {
      await monitoringSessionsApi.delete(id)
      setSessions(prev => prev.filter(s => s.id !== id))
      if (selectedSession?.id === id) {
        setSelectedSession(null)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete monitoring session')
    }
  }

  const handleView = (session: MonitoringSession) => {
    if (onViewSession) {
      onViewSession(session)
    }
    setSelectedSession(session)
  }

  const resetZoom = () => {
    if (chartRef.current) {
      chartRef.current.resetZoom()
    }
  }

  const signalUnitsMap = useMemo(() => {
    if (!selectedSession) return {}
    const map: Record<string, string> = {}
    selectedSession.signalConfigs.forEach(config => {
      const unit = config.engineeringUnitId ? engineeringUnits[config.engineeringUnitId]?.symbol : ''
      map[config.name] = unit
    })
    return map
  }, [selectedSession, engineeringUnits])

  useEffect(() => {
    if (selectedSession && signalUnitsMap) {
      const signalNames = selectedSession.signalConfigs.map(s => s.name)
      if (signalNames.length > 0) {
        setLeftYAxisSignal(signalNames[0])
        const units = signalNames.map(name => signalUnitsMap[name])
        const differentUnitIndex = units.findIndex((unit, i) => i > 0 && unit !== units[0])
        if (differentUnitIndex > 0) {
          setRightYAxisSignal(signalNames[differentUnitIndex])
        } else {
          setRightYAxisSignal('')
        }
      }
    }
  }, [selectedSession, signalUnitsMap])

  const chartData = useMemo(() => {
    if (!selectedSession || !selectedSession.dataPoints.length) return null

    const signalKeys = selectedSession.signalConfigs.map(s => s.name)
    const uniqueUnits = [...new Set(Object.values(signalUnitsMap).filter(u => u))]
    
    const unitToAxisId: Record<string, string> = {}
    uniqueUnits.forEach((unit, index) => {
      unitToAxisId[unit] = `y-${index}`
    })

    const hasSignalsWithoutUnit = signalKeys.some(key => !signalUnitsMap[key])

    const axisColors = ['#36a2eb', '#ff6384', '#4bc0c0', '#ff9f40', '#9966ff', '#c9cbcf']

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
      const signalUnit = signalUnitsMap[key]
      const yAxisID = signalUnit ? unitToAxisId[signalUnit] : 'y'

      return {
        label: key,
        data: selectedSession.dataPoints.map(point => ({
          x: point.timestamp,
          y: point.data[key] !== undefined ? Number(point.data[key]) : null,
        })),
        borderColor: color.border,
        backgroundColor: color.background,
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5,
        yAxisID,
      }
    })

    return { datasets, unitToAxisId, axisColors, hasSignalsWithoutUnit }
  }, [selectedSession, signalUnitsMap])

  const chartOptions: ChartOptions<'line'> = useMemo(() => {
    if (!chartData || !chartData.unitToAxisId) {
      return {
        responsive: true,
        maintainAspectRatio: false,
      }
    }

    const uniqueUnits = Object.keys(chartData.unitToAxisId)
    
    const leftAxisUnit = leftYAxisSignal ? signalUnitsMap[leftYAxisSignal] : ''
    const rightAxisUnit = rightYAxisSignal ? signalUnitsMap[rightYAxisSignal] : ''
    
    const leftAxisId = leftAxisUnit ? chartData.unitToAxisId[leftAxisUnit] : undefined
    const rightAxisId = rightAxisUnit ? chartData.unitToAxisId[rightAxisUnit] : undefined

    const scales: any = {
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
    }

    uniqueUnits.forEach((unit, index) => {
      const axisId = chartData.unitToAxisId[unit]
      const color = chartData.axisColors[index % chartData.axisColors.length]
      const isLeft = axisId === leftAxisId
      const isRight = axisId === rightAxisId

      if (isLeft) {
        scales[axisId] = {
          type: 'linear' as const,
          display: true,
          position: 'left' as const,
          title: {
            display: true,
            text: unit,
            color: color,
            font: { size: 12 },
          },
          ticks: { color: color, font: { size: 10 } },
          grid: { color: '#333', drawOnChartArea: true },
        }
      } else if (isRight) {
        scales[axisId] = {
          type: 'linear' as const,
          display: true,
          position: 'right' as const,
          title: {
            display: true,
            text: unit,
            color: color,
            font: { size: 12 },
          },
          ticks: { color: color, font: { size: 10 } },
          grid: { color: '#333', drawOnChartArea: false },
        }
      } else {
        scales[axisId] = {
          type: 'linear' as const,
          display: false,
          grid: { drawOnChartArea: false },
        }
      }
    })

    if (chartData.hasSignalsWithoutUnit) {
      scales.y = {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: !leftAxisId,
          text: '',
          color: '#888',
          font: { size: 12 },
        },
        ticks: { color: '#888', font: { size: 10 } },
        grid: { color: '#333', drawOnChartArea: !leftAxisId },
      }
    }

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
      scales,
      interaction: { intersect: false, mode: 'index' as const },
    }
  }, [chartData, leftYAxisSignal, rightYAxisSignal, signalUnitsMap])

  const formatDuration = (start: number, end: number) => {
    const duration = end - start
    if (duration < 60000) return `${Math.round(duration / 1000)}s`
    if (duration < 3600000) return `${Math.round(duration / 60000)}m`
    return `${Math.round(duration / 3600000)}h`
  }

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Monitoring Sessions</h2>
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
      <div className="modal-content modal-large monitoring-sessions" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Monitoring Sessions</h2>
          <button className="btn-icon" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="error-banner">
              {error}
              <button className="btn-icon" onClick={() => setError(null)}>×</button>
            </div>
          )}

          {sessions.length === 0 ? (
            <div className="empty-state">
              <p>No monitoring sessions saved yet.</p>
              <p>Start monitoring a device and save the session to see it here.</p>
            </div>
          ) : (
            <div className="sessions-layout">
              <div className="sessions-list">
                <h3>Saved Sessions</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Session</th>
                      <th>Duration</th>
                      <th>Points</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map(session => (
                      <tr 
                        key={session.id} 
                        className={selectedSession?.id === session.id ? 'selected' : ''}
                        onClick={() => setSelectedSession(session)}
                      >
                        <td>{session.name}</td>
                        <td>{formatDuration(session.startTime, session.endTime)}</td>
                        <td>{session.dataPoints.length}</td>
                        <td>{new Date(session.createdAt).toLocaleDateString()}</td>
                        <td>
                          <button
                            className="btn-icon btn-secondary"
                            onClick={(e) => { e.stopPropagation(); handleView(session); }}
                            title="View session"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                          </button>
                          <button
                            className="btn-icon btn-danger"
                            onClick={(e) => { e.stopPropagation(); handleDelete(session.id); }}
                            title="Delete session"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedSession && (
                <div className="session-details">
                  <div className="session-header">
                    <h3>{selectedSession.name}</h3>
                    <div className="session-meta">
                      <span>Device: {devices[selectedSession.deviceId]?.name || 'Unknown'}</span>
                      <span>Duration: {formatDuration(selectedSession.startTime, selectedSession.endTime)}</span>
                      <span>Sampling: {selectedSession.samplingPeriod}ms</span>
                      <span>Logging: {selectedSession.defaultLoggingPeriod}ms</span>
                    </div>
                  </div>

                  <div className="view-controls">
                    <div className="controls-left">
                      {viewMode === 'graph' && (
                        <button className="btn btn-small" onClick={resetZoom}>
                          Reset Zoom
                        </button>
                      )}
                    </div>
                    <div className="axis-controls">
                      <label className="axis-label">
                        Left Y-Axis:
                        <select
                          value={leftYAxisSignal}
                          onChange={(e) => setLeftYAxisSignal(e.target.value)}
                          className="axis-select"
                        >
                          <option value="">None</option>
                          {selectedSession.signalConfigs.map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="axis-label">
                        Right Y-Axis:
                        <select
                          value={rightYAxisSignal}
                          onChange={(e) => setRightYAxisSignal(e.target.value)}
                          className="axis-select"
                        >
                          <option value="">None</option>
                          {selectedSession.signalConfigs.map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="view-toggle">
                      <button
                        className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                        onClick={() => setViewMode('table')}
                      >
                        Table
                      </button>
                      <button
                        className={`toggle-btn ${viewMode === 'graph' ? 'active' : ''}`}
                        onClick={() => setViewMode('graph')}
                      >
                        Graph
                      </button>
                    </div>
                  </div>

                  {viewMode === 'graph' ? (
                    <div className="session-chart">
                      {chartData && (
                        <Line 
                          ref={chartRef}
                          data={chartData} 
                          options={chartOptions}
                          key={selectedSession.id}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="session-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Timestamp</th>
                            {selectedSession.signalConfigs.map(s => (
                              <th key={s.name}>{s.name} ({s.aggregation})</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedSession.dataPoints.slice(0, 100).map((point, index) => (
                            <tr key={index}>
                              <td>{new Date(point.timestamp).toLocaleTimeString()}</td>
                              {selectedSession.signalConfigs.map(s => (
                                <td key={s.name}>
                                  {point.data[s.name] !== undefined 
                                    ? Number(point.data[s.name]).toFixed(2) 
                                    : 'N/A'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
