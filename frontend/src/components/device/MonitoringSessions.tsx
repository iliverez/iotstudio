import { useState, useEffect, useMemo, useRef } from 'react'
import { monitoringSessionsApi, devicesApi, engineeringUnitsApi, annotationsApi } from '@/api/client'
import type { MonitoringSession, Device, EngineeringUnit, Annotation } from '@/types'
import { AnnotationEditor } from '../session/AnnotationEditor'
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
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [showAnnotations] = useState(true)
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null)
  const [showAnnotationEditor, setShowAnnotationEditor] = useState(false)
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartX, setDragStartX] = useState<number | null>(null)
  const [dragCurrentX, setDragCurrentX] = useState<number | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<{ start: number; end: number } | null>(null)
  const [visibleAnnotations, setVisibleAnnotations] = useState<Set<string>>(new Set())
  const [hoveredAnnotation, setHoveredAnnotation] = useState<string | null>(null)
  const [zoomKey, setZoomKey] = useState(0)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const annotationListRef = useRef<HTMLDivElement>(null)
  const annotationItemRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  useEffect(() => {
    loadSessions()
    loadEngineeringUnits()
  }, [])

  useEffect(() => {
    if (!selectedAnnotation) return
    
    const timer = setTimeout(() => {
      const element = annotationItemRefs.current.get(selectedAnnotation)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
    
    return () => clearTimeout(timer)
  }, [selectedAnnotation])

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
    loadAnnotations(session.id)
  }

  const loadAnnotations = async (sessionId: string) => {
    try {
      const response = await annotationsApi.listByMonitoringSession(sessionId)
      setAnnotations(response.data)
    } catch (err: any) {
      console.error('Failed to load annotations:', err)
    }
  }

  const resetZoom = () => {
    if (chartRef.current) {
      chartRef.current.resetZoom()
    }
  }

  const handleEditAnnotation = (annotation: Annotation) => {
    setEditingAnnotation(annotation)
    setShowAnnotationEditor(true)
  }

  const handleDeleteAnnotation = async (id: string) => {
    if (!confirm('Are you sure you want to delete this annotation?')) {
      return
    }

    try {
      await annotationsApi.delete(id)
      setAnnotations(prev => prev.filter(a => a.id !== id))
    } catch (err: any) {
      setError(err.message || 'Failed to delete annotation')
    }
  }

  const handleAnnotationSave = (annotation: Annotation) => {
    if (editingAnnotation) {
      setAnnotations(prev => prev.map(a => a.id === annotation.id ? annotation : a))
    } else {
      setAnnotations(prev => [...prev, annotation])
    }
  }

  const handleSelectAnnotation = (id: string) => {
    const newId = selectedAnnotation === id ? null : id
    setSelectedAnnotation(newId)
    
    if (newId) {
      setTimeout(() => {
        const element = annotationItemRefs.current.get(id)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
    }
  }

  const toggleAnnotationVisibility = (id: string) => {
    setVisibleAnnotations(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const toggleAllAnnotations = () => {
    if (visibleAnnotations.size === annotations.length) {
      setVisibleAnnotations(new Set())
    } else {
      setVisibleAnnotations(new Set(annotations.map(a => a.id)))
    }
  }

  const handleChartMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey) {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      setIsDragging(true)
      setDragStartX(x)
      setDragCurrentX(x)
      e.preventDefault()
    }
  }

  const handleChartMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      setDragCurrentX(x)
    }
  }

  const handleChartMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging && dragStartX !== null && dragCurrentX !== null && selectedSession && chartRef.current) {
      const rect = e.currentTarget.getBoundingClientRect()
      const startX = Math.min(dragStartX, dragCurrentX)
      const endX = Math.max(dragStartX, dragCurrentX)
      const duration = endX - startX

      if (duration > 10) {
        const chart = chartRef.current
        const scale = chart.scales.x

        const chartCanvas = chart.canvas
        const chartRect = chartCanvas.getBoundingClientRect()
        const chartLeft = chartRect.left - rect.left

        const startXRelativeToChart = startX - chartLeft
        const endXRelativeToChart = endX - chartLeft

        const regionStart = Math.round(scale.getValueForPixel(startXRelativeToChart))
        const regionEnd = Math.round(scale.getValueForPixel(endXRelativeToChart))

        setEditingAnnotation(null)
        setSelectedRegion({ start: regionStart, end: regionEnd })
        setShowAnnotationEditor(true)
      }
    }

    setIsDragging(false)
    setDragStartX(null)
    setDragCurrentX(null)
  }

  const handleChartDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedSession || !chartRef.current) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left

    const chart = chartRef.current
    const scale = chart.scales.x

    const chartCanvas = chart.canvas
    const chartRect = chartCanvas.getBoundingClientRect()
    const chartLeft = chartRect.left - rect.left
    const xRelativeToChart = x - chartLeft

    const timestamp = Math.round(scale.getValueForPixel(xRelativeToChart))

    const nearestPoint = selectedSession.dataPoints
      .map(p => ({ ...p, distance: Math.abs(p.timestamp - timestamp) }))
      .reduce((nearest, current) => (current.distance < nearest.distance ? current : nearest))

    setEditingAnnotation(null)
    setSelectedPoint({
      signalName: selectedSession.signalConfigs[0]?.name || '',
      timestamp: nearestPoint.timestamp,
      value: Number(nearestPoint.data[selectedSession.signalConfigs[0]?.name] || 0),
    })
    setShowAnnotationEditor(true)
  }

  const [selectedPoint, setSelectedPoint] = useState<{ signalName: string; timestamp: number; value: number } | null>(null)

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
          pan: {
            enabled: true,
            mode: 'x' as const,
            onPanStart: (context: any) => {
              if (context.event?.metaKey || context.event?.ctrlKey) {
                return false
              }
              return true
            },
            onPan: ({ chart }: any) => {
              setTimeout(() => {
                chart.update('none')
                setZoomKey(k => k + 1)
              }, 10)
            },
          },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'x' as const,
            onZoomStart: (context: any) => {
              if (context.event?.metaKey || context.event?.ctrlKey) {
                return false
              }
              return true
            },
            onZoom: ({ chart }: any) => {
              setTimeout(() => {
                chart.update('none')
                setZoomKey(k => k + 1)
              }, 10)
            },
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
                        <>
                          <button className="btn btn-small" onClick={resetZoom}>
                            Reset Zoom
                          </button>
                        </>
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
                    <>
                      <div className="chart-hint">
                        💡 <kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + drag = region, <kbd>Double-click</kbd> = point
                      </div>
                      <div
                        ref={chartContainerRef}
                        className="session-chart"
                        onMouseDown={handleChartMouseDown}
                        onMouseMove={handleChartMouseMove}
                        onMouseUp={handleChartMouseUp}
                        onDoubleClick={handleChartDoubleClick}
                        onMouseLeave={() => {
                          setIsDragging(false)
                          setDragStartX(null)
                          setDragCurrentX(null)
                          setHoveredAnnotation(null)
                        }}
                      >
                        {chartData && (
                          <Line
                            ref={chartRef}
                            data={chartData}
                            options={chartOptions}
                            key={selectedSession.id}
                          />
                        )}
                        {showAnnotations && (
                          <div className="annotation-markers" key={zoomKey}>
                            {annotations
                              .filter(a => a.type === 'region' && a.regionStart && a.regionEnd && visibleAnnotations.has(a.id))
                              .map(annotation => {
                                if (!selectedSession || !chartData || !chartRef.current) return null
                                const chart = chartRef.current
                                const scale = chart.scales.x

                                const startXPixel = scale.getPixelForValue(annotation.regionStart!)
                                const endXPixel = scale.getPixelForValue(annotation.regionEnd!)

                                return (
                                  <div
                                    key={annotation.id}
                                    className={`annotation-region ${selectedAnnotation === annotation.id ? 'selected' : ''}`}
                                    style={{
                                      left: `${startXPixel}px`,
                                      width: `${endXPixel - startXPixel}px`,
                                    }}
                                  >
                                    <div
                                      className="annotation-region-clickable"
                                      onClick={(e) => {
                                        e.stopPropagation()
                handleSelectAnnotation(annotation.id)
              }}
                                      onMouseEnter={() => setHoveredAnnotation(annotation.id)}
                                      onMouseLeave={() => setHoveredAnnotation(null)}
                                    >
                                      {(hoveredAnnotation === annotation.id || selectedAnnotation === annotation.id) && (
                                        <div className="annotation-tooltip">
                                          <div className="annotation-tooltip-title">
                                            {annotation.title || (annotation.type === 'region' ? 'Region' : 'Point')}
                                          </div>
                                          {annotation.text && (
                                            <div className="annotation-tooltip-text">{annotation.text}</div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            {annotations
                              .filter(a => a.type === 'point' && a.points.length > 0 && visibleAnnotations.has(a.id))
                              .map(annotation => (
                                annotation.points.map((point, idx) => {
                                  if (!selectedSession || !chartData || !chartRef.current) return null
                                  const chart = chartRef.current
                                  const scale = chart.scales.x

                                  const xPosPixel = scale.getPixelForValue(point.timestamp)
                                  return (
                                    <div
                                      key={`${annotation.id}-${idx}`}
                                      className={`annotation-point-marker ${selectedAnnotation === annotation.id ? 'selected' : ''}`}
                                      style={{
                                        left: `${xPosPixel}px`,
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleSelectAnnotation(annotation.id)
                                      }}
                                    >
                                      <div className="annotation-point-tooltip">
                                        <div className="annotation-tooltip-title">
                                          {annotation.title || 'Point'}
                                        </div>
                                        <div className="annotation-tooltip-signal">
                                          {point.signalName}: {point.value}
                                        </div>
                                        {annotation.text && (
                                          <div className="annotation-tooltip-text">{annotation.text}</div>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })
                              ))}
                            {isDragging && dragStartX !== null && dragCurrentX !== null && selectedSession && (
                              <div
                                className="drag-selection"
                                style={{
                                  left: `${Math.min(dragStartX, dragCurrentX)}px`,
                                  width: `${Math.abs(dragCurrentX - dragStartX)}px`,
                                }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                      {showAnnotations && (
                        <div className="annotation-list" ref={annotationListRef}>
                          <div className="annotation-list-header">
                            <h4>Annotations ({annotations.length})</h4>
                            {annotations.length > 0 && (
                              <button
                                className="btn-link btn-small"
                                onClick={toggleAllAnnotations}
                                title={visibleAnnotations.size === annotations.length ? 'Hide all annotations' : 'Show all annotations'}
                              >
                                {visibleAnnotations.size === annotations.length ? 'Hide All' : 'Show All'}
                              </button>
                            )}
                          </div>
                          {annotations.length === 0 ? (
                            <p className="empty-annotations">No annotations yet. Use Cmd/Ctrl+drag to create a region or double-click to create a point.</p>
                          ) : (
                            <div className="annotation-items">
                              {annotations.map(annotation => (
                                <div
                                  key={annotation.id}
                                  ref={(el) => {
                                    if (el) annotationItemRefs.current.set(annotation.id, el)
                                    else annotationItemRefs.current.delete(annotation.id)
                                  }}
                                  className={`annotation-item ${selectedAnnotation === annotation.id ? 'selected' : ''} ${!visibleAnnotations.has(annotation.id) ? 'hidden' : ''}`}
                                  onClick={() => handleSelectAnnotation(annotation.id)}
                                >
                                  <div className="annotation-item-header">
                                    <div className="annotation-type-row">
                                      {annotation.title && (
                                        <span className="annotation-title-inline">
                                          {annotation.title}
                                        </span>
                                      )}
                                      <span className="annotation-type-yellow">
                                        {annotation.type === 'region' ? 'Region' : 'Point'}
                                      </span>
                                    </div>
                                    <div className="annotation-actions">
                                      <button
                                        className="btn-icon btn-small"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          toggleAnnotationVisibility(annotation.id)
                                        }}
                                        title={visibleAnnotations.has(annotation.id) ? 'Hide on chart' : 'Show on chart'}
                                      >
                                        {visibleAnnotations.has(annotation.id) ? '👁' : '👁‍🗨'}
                                      </button>
                                      <button
                                        className="btn-icon btn-small"
                                        onClick={(e) => { e.stopPropagation(); handleEditAnnotation(annotation); }}
                                        title="Edit"
                                      >
                                        ✏
                                      </button>
                                      <button
                                        className="btn-icon btn-small btn-danger"
                                        onClick={(e) => { e.stopPropagation(); handleDeleteAnnotation(annotation.id); }}
                                        title="Delete"
                                      >
                                        🗑
                                      </button>
                                    </div>
                                  </div>
                                  <div className="annotation-text">{annotation.text}</div>
                                  {annotation.type === 'region' && (
                                    <div className="annotation-time">
                                      {new Date(annotation.regionStart || 0).toLocaleTimeString()} - {new Date(annotation.regionEnd || 0).toLocaleTimeString()}
                                    </div>
                                  )}
                                  {annotation.type === 'point' && annotation.points.length > 0 && (
                                    <div className="annotation-points">
                                      {annotation.points.map((point, i) => (
                                        <span key={i} className="annotation-point">
                                          {point.signalName}: {point.value}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
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

          {showAnnotationEditor && selectedSession && (
            <AnnotationEditor
              monitoringSessionId={selectedSession.id}
              editingAnnotation={editingAnnotation}
              annotationType={selectedRegion ? 'region' : selectedPoint ? 'point' : undefined}
              initialRegion={selectedRegion || undefined}
              initialPoints={selectedPoint ? [selectedPoint] : undefined}
              onClose={() => {
                setShowAnnotationEditor(false)
                setSelectedRegion(null)
                setSelectedPoint(null)
              }}
              onSave={handleAnnotationSave}
            />
          )}
        </div>
      </div>
    </div>
  )
}
