import { useState, useEffect } from 'react'
import { parsersApi } from '@/api/client'
import { ParserForm } from '@/components/parser/ParserForm'
import type { Device, Connection, Parser } from '@/types'
import './DeviceForm.css'

interface DeviceFormProps {
  connections: Connection[]
  onSave: (device: Partial<Device>) => Promise<void>
  onClose: () => void
  defaultConnectionId?: string
}

export function DeviceForm({ connections, onSave, onClose, defaultConnectionId }: DeviceFormProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [connectionId, setConnectionId] = useState(defaultConnectionId || '')
  const [address, setAddress] = useState('')
  const [parserId, setParserId] = useState('')
  const [parsers, setParsers] = useState<Parser[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showParserForm, setShowParserForm] = useState(false)

  const loadParsers = async () => {
    try {
      const response = await parsersApi.list()
      setParsers(response.data || [])
    } catch (error) {
      console.error('Failed to load parsers:', error)
    }
  }

  const handleCreateParser = async (_parserData: Partial<Parser>) => {
    await loadParsers()
    setShowParserForm(false)
    // Select the newly created parser
    const response = await parsersApi.list()
    const newParsers = response.data || []
    if (newParsers.length > 0) {
      // Get the most recently created parser
      const latestParser = newParsers.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0]
      setParserId(latestParser.id)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Device name is required')
      return
    }

    if (!connectionId) {
      setError('Connection is required')
      return
    }

    setSubmitting(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || '',
        connectionId,
        address: address.trim() || '',
        parserId: parserId || '',
      })
    } catch (err) {
      setError('Failed to create device')
      setSubmitting(false)
    }
  }

  useEffect(() => {
    loadParsers()
  }, [])

  useEffect(() => {
    if (defaultConnectionId) {
      setConnectionId(defaultConnectionId)
    }
  }, [defaultConnectionId])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Device</h2>
          <button className="btn-icon" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="device-name">Device Name *</label>
            <input
              id="device-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Device"
              disabled={submitting}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="device-description">Description</label>
            <input
              id="device-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="device-connection">Connection *</label>
            <select
              id="device-connection"
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              disabled={submitting}
            >
              <option value="">Select Connection</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="device-address">Address</label>
            <input
              id="device-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g., 1, or coil:1"
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="device-parser">Parser (Optional)</label>
            <div className="parser-select-row">
              <select
                id="device-parser"
                value={parserId}
                onChange={(e) => setParserId(e.target.value)}
                disabled={submitting}
              >
                <option value="">No Parser</option>
                {parsers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.builtinType ? `(${p.builtinType})` : `(${p.type})`}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => setShowParserForm(true)}
                disabled={submitting}
                title="Create new parser"
              >
                + New
              </button>
            </div>
          </div>

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
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>

      {showParserForm && (
        <ParserForm
          onSave={handleCreateParser}
          onClose={() => setShowParserForm(false)}
        />
      )}
    </div>
  )
}
