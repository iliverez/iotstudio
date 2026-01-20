import { useState } from 'react'
import type { Connection } from '@/types'
import { ModbusTCPForm } from './ModbusTCPForm'
import { ModbusRTUForm } from './ModbusRTUForm'
import './ConnectionForm.css'

interface ConnectionFormProps {
  onSave: (connection: Partial<Connection>) => Promise<void>
  onClose: () => void
}

type ConnectionType = 'modbus_tcp' | 'modbus_rtu'

export function ConnectionForm({ onSave, onClose }: ConnectionFormProps) {
  const [connectionType, setConnectionType] = useState<ConnectionType>('modbus_tcp')
  const [name, setName] = useState('')
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    setError('')

    if (!name.trim()) {
      setError('Connection name is required')
      return
    }

    setSubmitting(true)
    try {
      await onSave({
        name: name.trim(),
        type: connectionType,
        config: JSON.stringify(config),
      })
    } catch (err) {
      setError('Failed to create connection')
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
          <h2>Add Connection</h2>
          <button className="btn-icon" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
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
              onChange={(e) => setConnectionType(e.target.value as ConnectionType)}
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
              type="button"
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
