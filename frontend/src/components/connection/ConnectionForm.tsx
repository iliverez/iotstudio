import { useState, useEffect } from 'react'
import { connectionsApi } from '@/api/client'
import { ModbusTCPForm } from './ModbusTCPForm'
import { ModbusRTUForm } from './ModbusRTUForm'
import type { Connection } from '@/types'
import './ConnectionForm.css'

interface ConnectionFormProps {
  sessionId: string
  connection?: Connection
  onSave: () => void
  onClose: () => void
}

type ConnectionType = 'modbus_tcp' | 'modbus_rtu'

export function ConnectionForm({ sessionId, connection, onSave, onClose }: ConnectionFormProps) {
  const isEditing = !!connection
  const [connectionType, setConnectionType] = useState<ConnectionType>('modbus_tcp')
  const [name, setName] = useState('')
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  
  // Initialize default config when connection type changes
  const handleConnectionTypeChange = (type: ConnectionType) => {
    setConnectionType(type)
    // Set default config based on connection type
    if (type === 'modbus_tcp') {
      setConfig({ host: '192.168.1.100', port: 502, timeout: 5, keepAlive: false, maxRetries: 3, retryDelay: 1000 })
    } else if (type === 'modbus_rtu') {
      setConfig({ port: '/dev/ttyUSB0', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 })
    }
  }
  
  // Initialize default config on mount or when editing
  useEffect(() => {
    if (isEditing && connection) {
      setName(connection.name)
      setConnectionType(connection.type)
      try {
        const parsedConfig = JSON.parse(connection.config)
        setConfig(parsedConfig)
      } catch (err) {
        console.error('Failed to parse connection config:', err)
        // Set default config based on connection type
        if (connection.type === 'modbus_tcp') {
          setConfig({ host: '192.168.1.100', port: 502, timeout: 5, keepAlive: false, maxRetries: 3, retryDelay: 1000 })
        } else if (connection.type === 'modbus_rtu') {
          setConfig({ port: '/dev/ttyUSB0', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 })
        }
      }
    } else {
      // Set default config based on connection type
      if (connectionType === 'modbus_tcp') {
        setConfig({ host: '192.168.1.100', port: 502, timeout: 5, keepAlive: false, maxRetries: 3, retryDelay: 1000 })
      } else if (connectionType === 'modbus_rtu') {
        setConfig({ port: '/dev/ttyUSB0', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 })
      }
    }
  }, [isEditing, connection, connectionType])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Connection name is required')
      return
    }

    setSubmitting(true)
    try {
      if (isEditing && connection) {
        // Update existing connection
        const response = await connectionsApi.update(connection.id, {
          name: name.trim(),
          type: connectionType,
          config: JSON.stringify(config),
        })
        console.log('Connection updated:', response.data)
      } else {
        // Create new connection
        const response = await connectionsApi.create(sessionId, {
          name: name.trim(),
          type: connectionType,
          config: JSON.stringify(config),
        })
        console.log('Connection created:', response.data)
      }
      onSave()
      onClose()
    } catch (err) {
      setError(isEditing ? 'Failed to update connection' : 'Failed to create connection')
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfigChange = (newConfig: Record<string, unknown>) => {
    setConfig(newConfig)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? 'Edit Connection' : 'Add Connection'}</h2>
          <button className="btn-icon" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="connection-name">Connection Name</label>
            <input
              id="connection-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Connection"
              disabled={submitting}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="connection-type">Connection Type</label>
            <select
              id="connection-type"
              value={connectionType}
              onChange={(e) => handleConnectionTypeChange(e.target.value as ConnectionType)}
              disabled={submitting}
            >
              <option value="modbus_tcp">Modbus TCP</option>
              <option value="modbus_rtu">Modbus RTU</option>
            </select>
          </div>

          {connectionType === 'modbus_tcp' && (
            <ModbusTCPForm
              config={config}
              onChange={handleConfigChange}
              disabled={submitting}
            />
          )}

          {connectionType === 'modbus_rtu' && (
            <ModbusRTUForm
              config={config}
              onChange={handleConfigChange}
              disabled={submitting}
            />
          )}

          {error && <div className="error-message">{error}</div>}

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
