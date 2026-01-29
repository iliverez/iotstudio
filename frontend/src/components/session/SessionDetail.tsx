import { useState, useEffect } from 'react'
import { connectionsApi, devicesApi } from '@/api/client'
import type { Connection, Device } from '@/types'
import { ConnectionsTab } from '../connection/ConnectionsTab'
import { DevicesTab } from '../device/DevicesTab'
import { DashboardTab } from '../dashboard/DashboardTab'
import './SessionDetail.css'

interface SessionDetailProps {
  sessionId: string
}

type Tab = 'connections' | 'devices' | 'dashboard'
type ErrorType = 'system' | 'form'

export function SessionDetail({ sessionId }: SessionDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>('connections')
  const [connections, setConnections] = useState<Connection[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; type: ErrorType } | null>(null)
  const [loadingTimeout, setLoadingTimeout] = useState(false)

  const loadData = async () => {
    if (!sessionId || sessionId.trim() === '') {
      setError({ message: 'Invalid session ID', type: 'system' })
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadingTimeout(false)
    setError(null)

    const timeoutId = setTimeout(() => {
      setLoadingTimeout(true)
      setError({ message: 'Loading is taking too long. Please try again.', type: 'system' })
    }, 20000)

    try {
      const [connsRes, devsRes] = await Promise.all([
        connectionsApi.listBySession(sessionId),
        devicesApi.listBySession(sessionId),
      ])
      setConnections(connsRes.data || [])
      setDevices(devsRes.data || [])
    } catch (error: any) {
      console.error('Failed to load session data:', error)
      const isSystemError = error.response?.status >= 500 || error.response?.status === 0
      const errorMessage = error.response?.data?.error || error.message || 'Failed to load session data'
      setError({ message: errorMessage, type: isSystemError ? 'system' : 'form' })
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [sessionId])

  const handleConnectionUpdate = () => {
    loadData()
  }

  const handleDeviceUpdate = () => {
    loadData()
  }

  const handleRetry = () => {
    loadData()
  }

  return (
    <div className="session-detail">
      {error && (
        <div className={`error-banner error-${error.type}`}>
          <span>{error.message}</span>
          {error.type === 'system' && (
            <button className="btn btn-secondary" onClick={handleRetry}>
              Retry
            </button>
          )}
          <button className="btn-icon" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      <div className="session-tabs">
        <button
          className={`tab-button ${activeTab === 'connections' ? 'active' : ''}`}
          onClick={() => setActiveTab('connections')}
        >
          Connections ({connections.length})
        </button>
        <button
          className={`tab-button ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          Devices ({devices.length})
        </button>
        <button
          className={`tab-button ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
      </div>

      {loading && !loadingTimeout ? (
        <div className="loading">Loading session data...</div>
      ) : loadingTimeout ? (
        <div className="loading loading-timeout">
          <div className="timeout-icon">⏱</div>
          <div className="timeout-message">
            <p>Loading is taking longer than expected</p>
            <p>Please wait or try refreshing the page</p>
          </div>
        </div>
      ) : error ? null : (
        <>
          {activeTab === 'connections' && (
            <ConnectionsTab
              sessionId={sessionId}
              connections={connections}
              onUpdate={handleConnectionUpdate}
            />
          )}
          {activeTab === 'devices' && (
            <DevicesTab
              sessionId={sessionId}
              devices={devices}
              connections={connections}
              onUpdate={handleDeviceUpdate}
            />
          )}
          {activeTab === 'dashboard' && (
            <DashboardTab sessionId={sessionId} />
          )}
        </>
      )}
    </div>
  )
}
