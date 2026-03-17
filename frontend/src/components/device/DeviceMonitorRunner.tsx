import { useEffect, useRef, useCallback } from 'react'
import { devicesApi } from '@/api/client'
import { useDashboardStore } from '@/stores/dashboardStore'
import type { AggregatedDataPoint, RawDataPoint, AggregationType } from '@/types'

function getSignalValue(data: Record<string, unknown> | unknown[], signalName: string, signalIndex: number): unknown {
  if (Array.isArray(data)) {
    if (signalIndex < data.length) {
      return data[signalIndex]
    }
    return undefined
  }
  if (data[signalName] !== undefined) {
    return data[signalName]
  }
  const keys = Object.keys(data)
  if (signalIndex < keys.length) {
    return data[keys[signalIndex]]
  }
  return undefined
}

function aggregateValue(samples: RawDataPoint[], signalName: string, aggregation: AggregationType): unknown {
  if (samples.length === 0) return null
  
  const values = samples
    .map(s => getSignalValue(s.data, signalName, 0))
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

interface DeviceMonitorRunnerProps {
  deviceId: string
  sessionId: string
  connectionStatus: string
}

export function DeviceMonitorRunner({ deviceId, connectionStatus }: DeviceMonitorRunnerProps) {
  const updateDeviceMonitoring = useDashboardStore((state) => state.updateDeviceMonitoring)
  const activeDeviceMonitorings = useDashboardStore((state) => state.activeDeviceMonitorings)

  const pendingSamples = useRef<RawDataPoint[]>([])
  const lastPeriodEnd = useRef<number>(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isReadingRef = useRef(false) // Deduplicate concurrent reads
  const lastReadTime = useRef<number>(0) // Track last successful read time
  const isConnected = connectionStatus === 'connected'
  const hasInitialized = useRef(false)

  const getDeviceMonitoring = useCallback((id: string) => activeDeviceMonitorings.get(id) || null, [activeDeviceMonitorings])

  // Initialize lastPeriodEnd when monitoring starts
  useEffect(() => {
    const monitoring = getDeviceMonitoring(deviceId)
    if (monitoring?.monitoring && !hasInitialized.current) {
      const currentPeriod = Math.floor(Date.now() / monitoring.loggingPeriod) * monitoring.loggingPeriod
      lastPeriodEnd.current = currentPeriod
      hasInitialized.current = true
    } else if (!monitoring?.monitoring) {
      hasInitialized.current = false
    }
  }, [deviceId, getDeviceMonitoring, activeDeviceMonitorings])

  const processAggregation = useCallback(() => {
    const existingMonitoring = getDeviceMonitoring(deviceId)
    if (!existingMonitoring?.monitoring || !existingMonitoring.signalConfigs) return

    const currentPeriod = Math.floor(Date.now() / existingMonitoring.loggingPeriod) * existingMonitoring.loggingPeriod
    
    if (currentPeriod > lastPeriodEnd.current) {
      const periodSamples = pendingSamples.current.filter(
        s => s.timestamp > lastPeriodEnd.current && s.timestamp <= currentPeriod
      )
      
      console.log('Aggregation:', {
        deviceId,
        currentPeriod,
        lastPeriodEnd: lastPeriodEnd.current,
        periodSamplesCount: periodSamples.length,
        sampleData: periodSamples.slice(0, 2),
      })
      
      if (periodSamples.length > 0) {
        const aggregatedData: Record<string, unknown> = {}
        
        existingMonitoring.signalConfigs.forEach((config) => {
          const value = aggregateValue(periodSamples, config.name, config.aggregation)
          console.log(`Aggregating signal ${config.id} (${config.name}):`, value)
          // Store by signal NAME for display compatibility
          aggregatedData[config.name] = value
        })
        
        console.log('Aggregated data:', aggregatedData)
        
        const existingPoints = existingMonitoring.aggregatedDataPoints || []
        const newDataPoint: AggregatedDataPoint = {
          timestamp: currentPeriod,
          periodStart: currentPeriod - existingMonitoring.loggingPeriod,
          periodEnd: currentPeriod,
          data: aggregatedData,
        }
        
        updateDeviceMonitoring(deviceId, {
          aggregatedDataPoints: [...existingPoints, newDataPoint].slice(-5000),
        })
        
        pendingSamples.current = pendingSamples.current.filter(
          s => s.timestamp > currentPeriod
        )
      }
      
      lastPeriodEnd.current = currentPeriod
    }
  }, [deviceId, getDeviceMonitoring, updateDeviceMonitoring])

  const readDevice = useCallback(async () => {
    // Prevent concurrent reads
    if (isReadingRef.current) {
      console.log(`[Runner ${deviceId}] Read already in progress, skipping`)
      return
    }

    // Minimum time between reads to prevent overwhelming backend
    const timeSinceLastRead = Date.now() - lastReadTime.current
    const minReadInterval = 200 // Minimum 200ms between reads
    if (timeSinceLastRead < minReadInterval) {
      console.log(`[Runner ${deviceId}] Too soon since last read (${timeSinceLastRead}ms), skipping`)
      return
    }

    if (!isConnected) return

    try {
      isReadingRef.current = true
      
      const response = await devicesApi.read(deviceId)
      const dataPoint = response.data
      
      // Log raw data for debugging
      console.log('Raw device data:', {
        deviceId,
        timestamp: dataPoint.timestamp,
        data: dataPoint.data,
        dataType: Array.isArray(dataPoint.data) ? 'array' : typeof dataPoint.data,
        keys: !Array.isArray(dataPoint.data) ? Object.keys(dataPoint.data) : undefined,
      })
      
      const existingMonitoring = getDeviceMonitoring(deviceId)
      if (existingMonitoring?.monitoring) {
        pendingSamples.current.push({
          timestamp: Date.now(),
          data: dataPoint.data || {},
        })
        
        updateDeviceMonitoring(deviceId, {
          currentValues: dataPoint.data,
          lastUpdate: new Date(),
        })
        
        processAggregation()
      }
      
      lastReadTime.current = Date.now()
    } catch (err) {
      console.error('Background read failed:', err)
    } finally {
      isReadingRef.current = false
    }
  }, [deviceId, isConnected, getDeviceMonitoring, updateDeviceMonitoring, processAggregation])

  useEffect(() => {
    const existingMonitoring = getDeviceMonitoring(deviceId)
    const shouldRun = existingMonitoring?.monitoring && isConnected
    const samplingPeriod = existingMonitoring?.samplingPeriod || 1000
    
    console.log(`[Runner ${deviceId}] Monitoring state:`, {
      shouldRun,
      isConnected,
      samplingPeriod,
      hasInterval: intervalRef.current !== null,
      activeMonitoring: existingMonitoring,
    })
    
    if (shouldRun && !intervalRef.current) {
      console.log(`[Runner ${deviceId}] Starting interval with period:`, samplingPeriod)
      readDevice()
      intervalRef.current = setInterval(readDevice, samplingPeriod)
    } else if (!shouldRun && intervalRef.current) {
      console.log(`[Runner ${deviceId}] Stopping interval`)
      clearInterval(intervalRef.current)
      intervalRef.current = null
    } else if (shouldRun && intervalRef.current) {
      console.log(`[Runner ${deviceId}] Interval already running, no change needed`)
    }

    return () => {
      if (intervalRef.current) {
        console.log(`[Runner ${deviceId}] Cleanup: clearing interval`)
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, isConnected, activeDeviceMonitorings, readDevice])

  return null
}
