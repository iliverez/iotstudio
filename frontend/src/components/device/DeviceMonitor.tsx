import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react'
import { devicesApi, parsersApi, engineeringUnitsApi, sessionsApi } from '@/api/client'
import { useDashboardStore } from '@/stores/dashboardStore'
import type { Device, Parser, ModbusRegister, SignalConfig, AggregationType, RawDataPoint, AggregatedDataPoint, EngineeringUnit, Annotation } from '@/types'
import { AnnotationEditor } from '../session/AnnotationEditor'
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
    .map((s: RawDataPoint) => s.data[signalName])
    .filter((v: unknown) => v !== null && v !== undefined && typeof v === 'number')
    .map((v: unknown) => Number(v))
  
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
  const startDeviceMonitoring = useDashboardStore((state) => state.startDeviceMonitoring)
  const updateDeviceMonitoring = useDashboardStore((state) => state.updateDeviceMonitoring)
  const getDeviceMonitoring = useDashboardStore((state) => state.getDeviceMonitoring)
  
  const [parser, setParser] = useState<Parser | null>(null)
  const [loading, setLoading] = useState(true)
  const [samplingPeriod, setSamplingPeriod] = useState(1000) // Default 1 second
  const [loggingPeriod, setLoggingPeriod] = useState(5000) // Default 5 seconds
  const [defaultAggregation, setDefaultAggregation] = useState<AggregationType>('average')
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'graph'>('graph')
  const [showConfigPanel, setShowConfigPanel] = useState(false)
  const [showSignalSelection, setShowSignalSelection] = useState(false)
  const [engineeringUnits, setEngineeringUnits] = useState<EngineeringUnit[]>([])
  const [leftAxisSignal, setLeftAxisSignal] = useState<string>('')
  const [rightAxisSignal, setRightAxisSignal] = useState<string>('')
  const showAnnotations = true
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [showAnnotationEditor, setShowAnnotationEditor] = useState(false)
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null)
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartX, setDragStartX] = useState<number | null>(null)
  const [dragCurrentX, setDragCurrentX] = useState<number | null>(null)
  const [hoveredAnnotation, setHoveredAnnotation] = useState<string | null>(null)
  const [visibleAnnotations, setVisibleAnnotations] = useState<Set<string>>(new Set())
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const annotationListRef = useRef<HTMLDivElement>(null)
  const annotationItemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  
  // Internal state for aggregation
  const pendingSamples = useRef<RawDataPoint[]>([])
  const lastPeriodEnd = useRef<number>(0)
  const chartRef = useRef<ChartJS<'line'>>(null)
  const readIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Get active monitoring state from store
  const activeMonitoring = getDeviceMonitoring(device.id)
  const monitoring = activeMonitoring?.monitoring || false
  const aggregatedDataPoints = activeMonitoring?.aggregatedDataPoints || []
  const signalConfigs = activeMonitoring?.signalConfigs || []
  const currentValues = activeMonitoring?.currentValues || {}
  const monitorEndTime = activeMonitoring?.endTime

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
    loadEngineeringUnits()
    loadAnnotations()
  }, [device.parserId, device.id])

  const loadEngineeringUnits = async () => {
    try {
      const response = await engineeringUnitsApi.list()
      setEngineeringUnits(response.data)
    } catch (err) {
      console.error('Failed to load engineering units:', err)
    }
  }

  const loadAnnotations = async () => {
    if (!monitorEndTime) return // Only load annotations after monitoring stops
    try {
      // Note: Need to create monitoring session first to get annotations
      // For now, we'll store annotations in memory
    } catch (err) {
      console.error('Failed to load annotations:', err)
    }
  }

  // Initialize or restore monitoring state
  useEffect(() => {
    if (parser) {
      const existingMonitoring = getDeviceMonitoring(device.id)
      
      if (!existingMonitoring) {
        // Initialize monitoring state if it doesn't exist
        const registers = parser.type === 'modbus' && parser.modbusRegisters 
          ? parser.modbusRegisters 
          : []
        const fields = parser.type === 'visual' ? parser.fields : []
        
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
        
        // Auto-select signals with different units for right axis
        if (configs.length > 1) {
          const units = new Set(configs.map(c => c.engineeringUnitId).filter(Boolean))
          if (units.size > 1) {
            const firstUnit = configs[0].engineeringUnitId
            const rightAxisSignal = configs.find(c => c.engineeringUnitId && c.engineeringUnitId !== firstUnit)
            if (rightAxisSignal) {
              setRightAxisSignal(rightAxisSignal.name)
            }
          }
        }
        
        startDeviceMonitoring({
          deviceId: device.id,
          sessionId,
          monitoring: false,
          startTime: 0,
          samplingPeriod,
          loggingPeriod,
          defaultAggregation,
          signalConfigs: configs,
          aggregatedDataPoints: [],
          currentValues: {},
          lastUpdate: null,
          leftAxisSignal: '',
          rightAxisSignal: '',
        })
      }
    }
  }, [parser, device.id, sessionId, samplingPeriod, loggingPeriod, defaultAggregation, startDeviceMonitoring, getDeviceMonitoring])

  // Continue background monitoring
  useEffect(() => {
    if (monitoring && isConnected && !readIntervalRef.current) {
      readDevice() // Initial read
      readIntervalRef.current = setInterval(readDevice, samplingPeriod)
    }

    return () => {
      if (readIntervalRef.current) {
        clearInterval(readIntervalRef.current)
        readIntervalRef.current = null
      }
    }
  }, [monitoring, isConnected, samplingPeriod])

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
      // Get samples from completed period
      const periodSamples = pendingSamples.current.filter(
        s => s.timestamp > lastPeriodEnd.current && s.timestamp <= periodEnd
      )
      
      if (periodSamples.length > 0 && signalConfigs.length > 0) {
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
        
        updateDeviceMonitoring(device.id, {
          aggregatedDataPoints: [...aggregatedDataPoints, aggPoint].slice(-5000),
        })
        
        // Keep only samples from current period for next aggregation
        pendingSamples.current = pendingSamples.current.filter(
          s => s.timestamp > periodEnd
        )
      }
      
      lastPeriodEnd.current = periodEnd
    }
  }, [loggingPeriod, signalConfigs, aggregatedDataPoints, updateDeviceMonitoring, device.id])

  const readDevice = useCallback(async () => {
    if (!isConnected) {
      setError('Connection is not established')
      return
    }

    try {
      const response = await devicesApi.read(device.id)
      const dataPoint = response.data
      
      updateDeviceMonitoring(device.id, {
        currentValues: dataPoint.data || {},
        lastUpdate: new Date(),
      })
      setLastUpdate(new Date())
      
      // Only clear error on successful read
      if (error) {
        setError(null)
      }
      
      // Process aggregation with new data point
      processAggregation(dataPoint.data || {})
    } catch (err: any) {
      console.error('Failed to read device:', err)
      setError(err.response?.data?.error || err.message || 'Failed to read device')
    }
  }, [device.id, isConnected, processAggregation, error])

  const handleStartMonitoring = async () => {
    // Validate that at least one signal is selected
    const selectedSignals = signalConfigs.filter((s: SignalConfig) => s.selected)
    if (selectedSignals.length === 0) {
      setError('Please select at least one signal to monitor')
      return
    }
    
    // Only monitor selected signals
    const activeSignalConfigs = signalConfigs.filter((s: SignalConfig) => s.selected)
    
    updateDeviceMonitoring(device.id, {
      monitoring: true,
      startTime: Date.now(),
      endTime: undefined,
      aggregatedDataPoints: [],
      signalConfigs: activeSignalConfigs,
      currentValues: {},
      lastUpdate: null,
    })
    
    pendingSamples.current = []
    lastPeriodEnd.current = 0
    
    // Update session status to running
    updateSession(sessionId, { status: 'running' })
    
    try {
      await sessionsApi.update(sessionId, { status: 'running' })
    } catch (err) {
      console.error('Failed to update session status:', err)
    }
  }

  const handleStopMonitoring = async () => {
    updateDeviceMonitoring(device.id, {
      monitoring: false,
      endTime: Date.now(),
    })
    
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

  const handleSignalToggle = (signalName: string) => {
    const newConfigs = signalConfigs.map((s: SignalConfig) =>
      s.name === signalName
        ? { ...s, selected: !s.selected }
        : s
    )
    updateDeviceMonitoring(device.id, {
      signalConfigs: newConfigs,
    })
  }

  const handleSignalConfigChange = (signalName: string, field: 'loggingPeriod' | 'aggregation' | 'selected', value: number | AggregationType | boolean) => {
    const newConfigs = signalConfigs.map((s: SignalConfig) => 
      s.name === signalName 
        ? { ...s, [field]: value }
        : s
    )
    updateDeviceMonitoring(device.id, {
      signalConfigs: newConfigs,
    })
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
  const allSignals = signalConfigs || []

  const resetZoom = () => {
    if (chartRef.current) {
      chartRef.current.resetZoom()
    }
  }

  // Prepare chart data - show during and after monitoring
  const chartData = useMemo(() => {
    const points = aggregatedDataPoints
    if (points.length === 0) return null

    const activeSignals = allSignals.filter((s: SignalConfig) => s.selected)
    const signalKeys = activeSignals.map((s: SignalConfig) => s.name)
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
  }, [aggregatedDataPoints, allSignals, rightAxisSignal, monitorEndTime])

  const chartOptions = useMemo(() => {
    const activeSignals = allSignals.filter((s: SignalConfig) => s.selected)
    const hasRightAxis = rightAxisSignal !== '' && activeSignals.some((s: SignalConfig) => s.name === rightAxisSignal)
    const leftAxisConfig = activeSignals.find((s: SignalConfig) => s.name !== rightAxisSignal)
    const rightAxisConfig = activeSignals.find((s: SignalConfig) => s.name === rightAxisSignal)
    
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
      interaction: { intersect: false, mode: 'index' as const       },
    }
  }, [allSignals, engineeringUnits, rightAxisSignal, monitorEndTime])

  const formatDuration = (start: number, end: number) => {
    const duration = end - start
    if (duration < 60000) return `${Math.round(duration / 1000)}s`
    if (duration < 3600000) return `${Math.round(duration / 60000)}m`
    return `${Math.round(duration / 3600000)}h`
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
    if (isDragging && dragStartX !== null && dragCurrentX !== null && monitorEndTime && chartRef.current) {
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
    if (!monitorEndTime || !chartRef.current || aggregatedDataPoints.length === 0) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left

    const chart = chartRef.current
    const scale = chart.scales.x

    const chartCanvas = chart.canvas
    const chartRect = chartCanvas.getBoundingClientRect()
    const chartLeft = chartRect.left - rect.left
    const xRelativeToChart = x - chartLeft

    const timestamp = Math.round(scale.getValueForPixel(xRelativeToChart))

    const activeSignals = allSignals.filter((s: SignalConfig) => s.selected)
    if (activeSignals.length === 0) return

    const nearestPoint = aggregatedDataPoints
      .map(p => ({ ...p, distance: Math.abs(p.timestamp - timestamp) }))
      .reduce((nearest, current) => (current.distance < nearest.distance ? current : nearest))

    setEditingAnnotation(null)
    setSelectedPoint({
      signalName: activeSignals[0].name,
      timestamp: nearestPoint.timestamp,
      value: Number(nearestPoint.data[activeSignals[0].name] || 0),
    })
    setShowAnnotationEditor(true)
  }

  const handleDeleteAnnotation = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this annotation?')) {
      return
    }
    setAnnotations(prev => prev.filter(a => a.id !== id))
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
    setVisibleAnnotations(prev => {
      if (visibleAnnotations.size === annotations.length) {
        return new Set()
      } else {
        return new Set(annotations.map(a => a.id))
      }
    })
  }

  const [selectedPoint, setSelectedPoint] = useState<{ signalName: string; timestamp: number; value: number } | null>(null)

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
            {monitoring && <span className="monitoring-badge">● Monitoring</span>}
          </div>
          <div className="header-actions">
            {monitoring && (
              <button 
                className="btn btn-secondary"
                onClick={() => setShowSignalSelection(true)}
              >
                + Add Signal
              </button>
            )}
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
              Connection is not established. Please connect connection first.
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
                  <span className="config-hint">How often to read device</span>
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
              {allSignals.length > 0 && (
                <div className="signal-configs">
                  <h4>Signal Configuration</h4>
                  <table className="signal-config-table">
                    <thead>
                      <tr>
                        <th>Select</th>
                        <th>Signal</th>
                        <th>Logging Period (ms)</th>
                        <th>Aggregation</th>
                        <th>Axis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allSignals.map((signal) => (
                        <tr key={signal.name}>
                          <td>
                            <input
                              type="checkbox"
                              checked={signal.selected || false}
                              onChange={() => handleSignalToggle(signal.name)}
                              disabled={monitoring}
                            />
                          </td>
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

          {/* Signal Selection Panel for adding signals during monitoring */}
          {showSignalSelection && (
            <div className="signal-selection-panel">
              <h3>Select Additional Signals</h3>
              <div className="signal-selection-list">
                {allSignals.filter((s: SignalConfig) => !s.selected).map((signal) => (
                  <div key={signal.name} className="signal-selection-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={signal.selected || false}
                        onChange={() => handleSignalToggle(signal.name)}
                      />
                      <span>{signal.name}</span>
                      {signal.engineeringUnitId && (
                        <span className="unit-badge">
                          {engineeringUnits.find(e => e.id === signal.engineeringUnitId)?.symbol}
                        </span>
                      )}
                    </label>
                  </div>
                ))}
                {allSignals.filter((s: SignalConfig) => !s.selected).length === 0 && (
                  <p className="no-signals">All available signals are already selected</p>
                )}
              </div>
              <div className="signal-selection-actions">
                <button className="btn btn-secondary" onClick={() => setShowSignalSelection(false)}>
                  Close
                </button>
              </div>
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
                      <th>Select</th>
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
                        <td>
                          <input
                            type="checkbox"
                            checked={allSignals.find((s: SignalConfig) => s.name === reg.name)?.selected || false}
                            onChange={() => handleSignalToggle(reg.name)}
                            disabled={monitoring}
                          />
                        </td>
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
                      <th>Select</th>
                      <th>Name</th>
                      <th>Data Type</th>
                      <th>Offset</th>
                      <th>Current Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parser.fields.map((field, index) => (
                      <tr key={index}>
                        <td>
                          <input
                            type="checkbox"
                            checked={allSignals.find((s: SignalConfig) => s.name === field.name)?.selected || false}
                            onChange={() => handleSignalToggle(field.name)}
                            disabled={monitoring}
                          />
                        </td>
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

              {/* Show annotation button when monitoring is stopped */}
              {monitorEndTime && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowAnnotationEditor(true)}
                >
                  📝 Add Annotation
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
                  <div className="axis-controls">
                    <label className="axis-label">
                      Left Y-Axis:
                      <select
                        value={leftAxisSignal}
                        onChange={(e) => setLeftAxisSignal(e.target.value)}
                        className="axis-select"
                      >
                        <option value="">None</option>
                        {allSignals.filter((s: SignalConfig) => s.selected).map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="axis-label">
                      Right Y-Axis:
                      <select
                        value={rightAxisSignal}
                        onChange={(e) => setRightAxisSignal(e.target.value)}
                        className="axis-select"
                      >
                        <option value="">None</option>
                        {allSignals.filter((s: SignalConfig) => s.selected).map((s) => (
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
                  {viewMode === 'graph' && (
                    <button className="btn btn-small" onClick={resetZoom}>
                      Reset Zoom
                    </button>
                  )}
                </div>
              </div>

              {viewMode === 'table' ? (
                <div className="history-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        {allSignals.filter((s: SignalConfig) => s.selected).map((s: SignalConfig) => (
                          <th key={s.name}>{s.name} ({s.aggregation})</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {aggregatedDataPoints.slice(0, 100).map((point, index) => (
                        <tr key={index}>
                          <td>{new Date(point.timestamp).toLocaleTimeString()}</td>
                          {allSignals.filter((s: SignalConfig) => s.selected).map((s: SignalConfig) => (
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
                    <>
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
                        <Line ref={chartRef} data={chartData} options={chartOptions} />
                      </div>
                      {showAnnotations && (
                        <Fragment>
                          <div className="annotation-markers">
                            {annotations
                              .filter(a => a.type === 'region' && a.regionStart && a.regionEnd)
                              .map(annotation => {
                                if (!chartRef.current) return null
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
                                        setSelectedAnnotation(annotation.id)
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
                              )}
                            {annotations
                              .filter(a => a.type === 'point' && a.points.length > 0)
                              .map(annotation => (
                                annotation.points.map((point, idx) => {
                                  if (!chartRef.current) return null
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
                                        setSelectedAnnotation(annotation.id)
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
                            )}
                            {isDragging && dragStartX !== null && dragCurrentX !== null && monitorEndTime && (
                              <div
                                className="drag-selection"
                                style={{
                                  left: `${Math.min(dragStartX, dragCurrentX)}px`,
                                  width: `${Math.abs(dragCurrentX - dragStartX)}px`,
                                }}
                              />
                            )}
                          </div>
                        <>
                      )}
                        <div className="annotation-list" ref={annotationListRef}>
                          <div className="annotation-list-header">
                            <h4>Annotations ({annotations.length})</h4>
                          </div>
                          <div className="annotation-items">
                            {annotations.map(annotation => (
                              <div
                                key={annotation.id}
                                ref={(el) => {
                                  if (el) annotationItemRefs.current.set(annotation.id, el)
                                  else annotationItemRefs.current.delete(annotation.id)
                                }}
                                className={`annotation-item ${selectedAnnotation === annotation.id ? 'selected' : ''}`}
                                onClick={() => setSelectedAnnotation(annotation.id)}
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
                                      onClick={(e) => { e.stopPropagation(); setEditingAnnotation(annotation); }}
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
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Annotation Editor */}
        {showAnnotationEditor && monitorEndTime && (
          <div className="modal-overlay" onClick={() => setShowAnnotationEditor(false)}>
            <div className="modal-content modal-small" onClick={(e) => e.stopPropagation()}>
              <AnnotationEditor
                monitoringSessionId={device.id} // Use device ID as session ID for annotations
                editingAnnotation={editingAnnotation}
                onClose={() => {
                  setShowAnnotationEditor(false)
                  setEditingAnnotation(null)
                }}
                onSave={(annotation) => {
                  if (editingAnnotation) {
                    setAnnotations(prev => prev.map(a => a.id === annotation.id ? annotation : a))
                  } else {
                    setAnnotations(prev => [...prev, annotation])
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
