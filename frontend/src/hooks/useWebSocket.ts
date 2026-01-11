import { useEffect, useRef, useCallback } from 'react'
import type { WebSocketMessage } from '@/types'

interface WebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void
  onError?: (error: Event) => void
  onClose?: (event: CloseEvent) => void
  onOpen?: () => void
  reconnectAttempts?: number
  reconnectDelay?: number
}

export function useWebSocket(url: string, options: WebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const reconnectAttemptsRef = useRef(0)
  const isManualCloseRef = useRef(false)

  const {
    onMessage,
    onError,
    onClose,
    onOpen,
    reconnectAttempts = 5,
    reconnectDelay = 1000,
  } = options

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('WebSocket connected')
        reconnectAttemptsRef.current = 0
        onOpen?.()
      }

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          onMessage?.(message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        onError?.(error)
      }

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason)
        onClose?.(event)
        wsRef.current = null

        if (!isManualCloseRef.current && reconnectAttemptsRef.current < reconnectAttempts) {
          reconnectAttemptsRef.current++
          const delay = reconnectDelay * reconnectAttemptsRef.current
          console.log(`Reconnecting in ${delay}ms... (attempt ${reconnectAttemptsRef.current})`)
          reconnectTimeoutRef.current = setTimeout(connect, delay)
        }
      }
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
    }
  }, [url, onMessage, onError, onClose, onOpen, reconnectAttempts, reconnectDelay])

  const disconnect = useCallback(() => {
    isManualCloseRef.current = true
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  const sendMessage = useCallback((message: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket is not connected')
    }
  }, [])

  const isConnected = wsRef.current?.readyState === WebSocket.OPEN

  useEffect(() => {
    connect()
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return { sendMessage, isConnected, disconnect, connect }
}
