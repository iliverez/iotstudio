import { useState, useEffect } from 'react'
import { connectionsApi, devicesApi } from '@/api/client'
import { ConnectionForm } from './ConnectionForm'
import { DeviceForm } from '../device/DeviceForm'
import { DeviceMonitor } from '../device/DeviceMonitor'
import type { Connection, Device } from '@/types'
import './ConnectionsTab.css'

interface ConnectionsTabProps {
  sessionId: string
  connections: Connection[]
  onUpdate: () => void
}

export function ConnectionsTab({ sessionId, connections, onUpdate }: ConnectionsTabProps) {
  const [showConnectionForm, setShowConnectionForm] = useState(false)
  const [showDeviceForm, setShowDeviceForm] = useState(false)
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set())
  const [connectionsDevices, setConnectionsDevices] = useState<Map<string, Device[]>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [connectingIds, setConnectingIds] = useState<Set<string>>(new Set())
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null)

  const loadDevicesForConnection = async (connectionId: string) => {
    try {
      const response = await devicesApi.listByConnection(connectionId)
      setConnectionsDevices((prev) => new Map(prev).set(connectionId, response.data || []))
    } catch (err: any) {
      console.error('Failed to load devices for connection:', err)
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load devices'
      setError(errorMessage)
    }
  }

  const toggleConnection = (connectionId: string) => {
    setExpandedConnections((prev) => {
      const newExpanded = new Set(prev)
      if (newExpanded.has(connectionId)) {
        newExpanded.delete(connectionId)
      } else {
        newExpanded.add(connectionId)
        loadDevicesForConnection(connectionId)
      }
      return newExpanded
    })
  }

  const handleConnect = async (connectionId: string) => {
    setConnectingIds((prev) => new Set(prev).add(connectionId))
    try {
      await connectionsApi.connect(connectionId)
      onUpdate()
    } catch (err: any) {
      console.error('Failed to connect:', err)
      const errorMessage = err.response?.data?.error || err.message || 'Failed to connect'
      setError(errorMessage)
    } finally {
      setConnectingIds((prev) => {
        const newSet = new Set(prev)
        newSet.delete(connectionId)
        return newSet
      })
    }
  }

  const handleDisconnect = async (connectionId: string) => {
    setConnectingIds((prev) => new Set(prev).add(connectionId))
    try {
      await connectionsApi.disconnect(connectionId)
      onUpdate()
    } catch (err: any) {
      console.error('Failed to disconnect:', err)
      const errorMessage = err.response?.data?.error || err.message || 'Failed to disconnect'
      setError(errorMessage)
    } finally {
      setConnectingIds((prev) => {
        const newSet = new Set(prev)
        newSet.delete(connectionId)
        return newSet
      })
    }
  }

  const handleCreateDevice = async (deviceData: Partial<Device>) => {
    try {
      await devicesApi.create(sessionId, deviceData)
      setShowDeviceForm(false)
      await onUpdate()
      setConnectionsDevices(new Map())
      if (expandedConnections.size > 0) {
        for (const connId of expandedConnections) {
          await loadDevicesForConnection(connId)
        }
      }
    } catch (err: any) {
      console.error('Failed to create device:', err)
      const errorMessage = err.response?.data?.error || err.message || 'Failed to create device'
      setError(errorMessage)
    }
  }

  const handleDeleteConnection = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete connection "${name}"?`)) {
      return
    }

    try {
      await connectionsApi.delete(id)
      onUpdate()
    } catch (err: any) {
      console.error('Failed to delete connection:', err)
      const errorMessage = err.response?.data?.error || err.message || 'Failed to delete connection'
      setError(errorMessage)
    }
  }

  const handleDeleteDevice = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete device "${name}"?`)) {
      return
    }

    try {
      await devicesApi.delete(id)
      onUpdate()
    } catch (err: any) {
      console.error('Failed to delete device:', err)
      const errorMessage = err.response?.data?.error || err.message || 'Failed to delete device'
      setError(errorMessage)
    }
  }

  const connectionsList = connections || []
  const hasConnections = connectionsList.length > 0

  useEffect(() => {
    if (!hasConnections && connectionsList.length === 0) {
      setShowConnectionForm(true)
    }
  }, [hasConnections, connectionsList.length])

  return (
    <div className="connections-tab">
      {error && (
        <div className="inline-error">
          <span>{error}</span>
          <button className="btn-icon" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      <div className="tab-header">
        <h3>Connections</h3>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingConnection(null)
            setShowConnectionForm(true)
          }}
        >
          + Add Connection
        </button>
      </div>

      {!hasConnections ? (
        <div className="empty-state">
          <p>No connections yet. Add your first connection to get started.</p>
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingConnection(null)
              setShowConnectionForm(true)
            }}
          >
            + Add Connection
          </button>
        </div>
      ) : (
        <div className="connection-list">
          {connectionsList.map((connection) => {
            const devices = connectionsDevices.get(connection.id) || []
            const isExpanded = expandedConnections.has(connection.id)
            const isConnecting = connectingIds.has(connection.id)
            const isConnected = connection.status === 'connected'

            return (
              <div key={connection.id} className="connection-card-expanded">
                <div
                  className="connection-summary"
                  onClick={() => toggleConnection(connection.id)}
                >
                  <div className="connection-info">
                    <div className="connection-main">
                      <h4>{connection.name}</h4>
                      <span className={`connection-type`}>{connection.type}</span>
                    </div>
                    <div className="connection-bottom">
                      <div className="connection-meta">
                        <span className={`status status-${connection.status}`}>
                          {connection.status}
                        </span>
                        <span className="device-count">{devices.length} devices</span>
                      </div>
                      <div className="connection-actions-row">
                        <button
                          className="btn-icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingConnection(connection)
                            setShowConnectionForm(true)
                          }}
                          disabled={connection.status === 'connected'}
                          title={connection.status === 'connected' ? 'Disconnect before editing' : 'Edit connection'}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                          </svg>
                        </button>
                        <button
                          className="btn-icon btn-danger"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteConnection(connection.id, connection.name)
                          }}
                          disabled={connection.status === 'connected'}
                          title={connection.status === 'connected' ? 'Disconnect before deleting' : 'Delete connection'}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                        {isConnected ? (
                          <button
                            className="btn btn-secondary btn-small"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDisconnect(connection.id)
                            }}
                            disabled={isConnecting}
                            title="Disconnect"
                          >
                            {isConnecting ? 'Disconnecting...' : 'Disconnect'}
                          </button>
                        ) : (
                          <button
                            className="btn btn-primary btn-small"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleConnect(connection.id)
                            }}
                            disabled={isConnecting || connection.status === 'connecting'}
                            title="Connect"
                          >
                            {isConnecting || connection.status === 'connecting' ? 'Connecting...' : 'Connect'}
                          </button>
                        )}
                        <button className="btn-icon" onClick={(e) => { e.stopPropagation(); toggleConnection(connection.id) }}>
                          {isExpanded ? '▼' : '▶'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="connection-devices">
                    <div className="devices-header">
                      <span>Devices ({devices.length})</span>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setSelectedConnectionId(connection.id)
                          setShowDeviceForm(true)
                        }}
                      >
                        + Add Device
                      </button>
                    </div>

                    {devices.length === 0 ? (
                      <div className="empty-state">
                        <p>No devices yet for this connection.</p>
                      </div>
                    ) : (
                      <div className="devices-list">
                        {devices.map((device) => (
                          <div key={device.id} className="device-row">
                            <div className="device-info">
                              <span className="device-name">{device.name}</span>
                              {device.address && (
                                <span className="device-address">Address: {device.address}</span>
                              )}
                              {device.description && (
                                <span className="device-description">{device.description}</span>
                              )}
                            </div>
                            <div className="device-actions">
                              <button
                                className="btn btn-secondary btn-small"
                                onClick={() => setSelectedDevice(device)}
                                disabled={connection.status !== 'connected'}
                                title={connection.status === 'connected' ? 'Monitor device' : 'Connect first to monitor'}
                              >
                                📊 Monitor
                              </button>
                              <button
                                className="btn-icon btn-danger"
                                onClick={() => handleDeleteDevice(device.id, device.name)}
                                title="Delete device"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showConnectionForm && (
        <ConnectionForm
          sessionId={sessionId}
          connection={editingConnection || undefined}
          onSave={async () => {
            await onUpdate()
            setShowConnectionForm(false)
            setEditingConnection(null)
            setConnectionsDevices(new Map())
            if (expandedConnections.size > 0) {
              for (const connId of expandedConnections) {
                await loadDevicesForConnection(connId)
              }
            }
          }}
          onClose={() => {
            setShowConnectionForm(false)
            setEditingConnection(null)
            setError(null)
          }}
        />
      )}

      {showDeviceForm && (
        <DeviceForm
          connections={connectionsList}
          onSave={handleCreateDevice}
          defaultConnectionId={selectedConnectionId || undefined}
          onClose={() => {
            setShowDeviceForm(false)
            setSelectedConnectionId(null)
            setError(null)
          }}
        />
      )}

      {selectedDevice && (
        <DeviceMonitor
          device={selectedDevice}
          connectionStatus={connections.find((c) => c.id === selectedDevice.connectionId)?.status || 'disconnected'}
          sessionId={sessionId}
          onClose={() => setSelectedDevice(null)}
        />
      )}
    </div>
  )
}
