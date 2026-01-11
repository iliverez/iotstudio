import { useEffect, useRef } from 'react'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useWebSocket } from './useWebSocket'

const WS_URL = `${import.meta.env.VITE_WS_URL || 'ws://localhost:8080'}/ws`

export function useData(sessionId?: string) {
  const { updateMetricTransient, addDataPoint, activeSessionId } = useDashboardStore()
  const activeSession = sessionId || activeSessionId

  const handleMessage = (message: any) => {
    if (message.type === 'data' && message.sessionId === activeSession) {
      Object.entries(message.data || {}).forEach(([key, value]) => {
        updateMetricTransient(`${message.deviceId}_${key}`, value)
      })

      if (message.deviceId) {
        addDataPoint(message.deviceId, {
          sessionId: message.sessionId,
          deviceId: message.deviceId,
          timestamp: message.timestamp,
          data: message.data as Record<string, unknown>,
        })
      }
    } else if (message.type === 'error') {
      console.error('WebSocket error:', message.error)
    }
  }

  const { sendMessage, isConnected } = useWebSocket(WS_URL, {
    onMessage: handleMessage,
  })

  const subscribe = (sessionId: string) => {
    sendMessage({
      type: 'subscribe',
      sessionId,
    })
  }

  const unsubscribe = (sessionId: string) => {
    sendMessage({
      type: 'unsubscribe',
      sessionId,
    })
  }

  useEffect(() => {
    if (activeSession && isConnected) {
      subscribe(activeSession)
      return () => unsubscribe(activeSession)
    }
  }, [activeSession, isConnected])

  return { subscribe, unsubscribe, isConnected }
}
