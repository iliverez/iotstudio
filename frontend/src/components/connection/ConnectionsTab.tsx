import { useState } from 'react'
import { connectionsApi, devicesApi } from '@/api/client'
import { ConnectionForm } from './ConnectionForm'
import { DeviceForm } from '../device/DeviceForm'
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

  const loadDevicesForConnection = async (connectionId: string) => {
    try {
      const response = await devicesApi.listByConnection(connectionId)
      setConnectionsDevices((prev) => new Map(prev).set(connectionId, response.data || []))
    } catch (error) {
      console.error('Failed to load devices for connection:', error)
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

  const handleCreateDevice = async (deviceData: Partial<Device>) => {
    await devicesApi.create(sessionId, deviceData)
    setShowDeviceForm(false)
    await onUpdate()
  }

  const handleDeleteConnection = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete connection "${name}"?`)) {
      return
    }

    try {
      await connectionsApi.delete(id)
      onUpdate()
    } catch (error) {
      console.error('Failed to delete connection:', error)
    }
  }

  const handleDeleteDevice = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete device "${name}"?`)) {
      return
    }

    try {
      await devicesApi.delete(id)
      onUpdate()
    } catch (error) {
      console.error('Failed to delete device:', error)
    }
  }

  return (
    <div className="connections-tab">
      <div className="tab-header">
        <h3>Connections</h3>
        <button className="btn btn-primary" onClick={() => setShowConnectionForm(true)}>
          + Add Connection
        </button>
      </div>

      {!connections || connections.length === 0 ? (
        <div className="empty-state">
          <p>No connections yet. Add your first connection to get started.</p>
        </div>
      ) : (
        <div className="connection-list">
          {connections.map((connection) => {
            const devices = connectionsDevices.get(connection.id) || []
            const isExpanded = expandedConnections.has(connection.id)

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
                    <div className="connection-meta">
                      <span className={`status status-${connection.status}`}>
                        {connection.status}
                      </span>
                      <span className="device-count">{devices.length} devices</span>
                    </div>
                  </div>
                  <button className="btn-icon">{isExpanded ? '▼' : '▶'}</button>
                </div>

                {isExpanded && (
                  <div className="connection-devices">
                    <div className="devices-header">
                      <span>Devices ({devices.length})</span>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setShowDeviceForm(true)}
                      >
                        + Add Device
                      </button>
                    </div>

                    {!devices || devices.length === 0 ? (
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
                            <button
                              className="btn-icon btn-danger"
                              onClick={() => handleDeleteDevice(device.id, device.name)}
                              title="Delete device"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="connection-actions">
                      <button
                        className="btn btn-danger"
                        onClick={() => handleDeleteConnection(connection.id, connection.name)}
                      >
                        Delete Connection
                      </button>
                    </div>
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
          onSave={onUpdate}
          onClose={() => setShowConnectionForm(false)}
        />
      )}

      {showDeviceForm && (
        <DeviceForm
          connections={connections}
          onSave={handleCreateDevice}
          onClose={() => setShowDeviceForm(false)}
        />
      )}
    </div>
  )
}
