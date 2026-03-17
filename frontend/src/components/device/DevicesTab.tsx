import { useState, useEffect } from 'react'
import { devicesApi, parsersApi } from '@/api/client'
import { DeviceForm } from './DeviceForm'
import type { Device, Connection, Parser } from '@/types'
import './DevicesTab.css'

interface DevicesTabProps {
  sessionId: string
  devices: Device[]
  connections: Connection[]
  onUpdate: () => void
}

export function DevicesTab({ sessionId, devices, connections, onUpdate }: DevicesTabProps) {
  const [showForm, setShowForm] = useState(false)
  const [parsers, setParsers] = useState<Parser[]>([])
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)

  useEffect(() => {
    const loadParsers = async () => {
      try {
        const response = await parsersApi.list()
        setParsers(response.data || [])
      } catch (error) {
        console.error('Failed to load parsers:', error)
      }
    }
    loadParsers()
  }, [])

  const handleCreateDevice = async (deviceData: Partial<Device>) => {
    if (editingDevice) {
      await devicesApi.update(editingDevice.id, deviceData)
      setEditingDevice(null)
    } else {
      await devicesApi.create(sessionId, deviceData)
    }
    setShowForm(false)
    onUpdate()
  }

  const handleEditDevice = (device: Device) => {
    setEditingDevice(device)
    setShowForm(true)
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

  const getParserName = (parserId: string) => {
    const parser = parsers.find((p) => p.id === parserId)
    return parser?.name || 'Unknown'
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
                <div className="device-actions">
                  <button
                    className="btn-icon btn-edit"
                    onClick={() => handleEditDevice(device)}
                    title="Edit device"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                  </button>
                  <button
                    className="btn-icon btn-danger"
                    onClick={() => handleDeleteDevice(device.id, device.name)}
                    title="Delete device"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
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
                    <span className="label">Parser:</span>
                    <span className="value">{getParserName(device.parserId)}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <DeviceForm
          device={editingDevice || undefined}
          connections={connections}
          onSave={handleCreateDevice}
          onClose={() => {
            setShowForm(false)
            setEditingDevice(null)
          }}
        />
      )}
    </div>
  )
}
