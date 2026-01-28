import { useState } from 'react'
import { devicesApi } from '@/api/client'
import { DeviceForm } from './DeviceForm'
import type { Device, Connection } from '@/types'
import './DevicesTab.css'

interface DevicesTabProps {
  sessionId: string
  devices: Device[]
  connections: Connection[]
  onUpdate: () => void
}

export function DevicesTab({ sessionId, devices, connections, onUpdate }: DevicesTabProps) {
  const [showForm, setShowForm] = useState(false)

  const handleCreateDevice = async (deviceData: Partial<Device>) => {
    await devicesApi.create(sessionId, deviceData)
    setShowForm(false)
    onUpdate()
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

  const getConnectionName = (connectionId: string) => {
    const conn = connections.find((c) => c.id === connectionId)
    return conn?.name || 'Unknown'
  }

  return (
    <div className="devices-tab">
      <div className="tab-header">
        <h3>Devices</h3>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Add Device
        </button>
      </div>

      {!devices || devices.length === 0 ? (
        <div className="empty-state">
          <p>No devices yet. Add your first device to get started.</p>
        </div>
      ) : (
        <div className="devices-list">
          {devices.map((device) => (
            <div key={device.id} className="device-card">
              <div className="device-card-header">
                <div className="device-info">
                  <h4>{device.name}</h4>
                  {device.description && (
                    <p className="device-description">{device.description}</p>
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
              <div className="device-card-body">
                <div className="device-detail">
                  <span className="label">Connection:</span>
                  <span className="value">{getConnectionName(device.connectionId)}</span>
                </div>
                {device.address && (
                  <div className="device-detail">
                    <span className="label">Address:</span>
                    <span className="value">{device.address}</span>
                  </div>
                )}
                {device.parserId && (
                  <div className="device-detail">
                    <span className="label">Parser ID:</span>
                    <span className="value">{device.parserId}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <DeviceForm
          connections={connections}
          onSave={handleCreateDevice}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
