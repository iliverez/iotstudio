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

export function SessionDetail({ sessionId }: SessionDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>('connections')
  const [connections, setConnections] = useState<Connection[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    try {
      const [connsRes, devsRes] = await Promise.all([
        connectionsApi.listBySession(sessionId),
        devicesApi.listBySession(sessionId),
      ])
      setConnections(connsRes.data || [])
      setDevices(devsRes.data || [])
    } catch (error) {
      console.error('Failed to load session data:', error)
    } finally {
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

  return (
    <div className="session-detail">
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

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
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
