import { useState, useEffect } from 'react'
import { connectionsApi } from '@/api/client'
import { useDashboardStore } from '@/stores/dashboardStore'
import { ConnectionForm } from './ConnectionForm'
import type { Connection } from '@/types'
import './ConnectionPanel.css'

export function ConnectionPanel() {
  const { activeSession } = useDashboardStore()
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const loadConnections = async () => {
    if (!activeSession) return

    setLoading(true)
    try {
      const response = await connectionsApi.list(activeSession.id)
      setConnections(response.data)
    } catch (error) {
      console.error('Failed to load connections:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConnections()
  }, [activeSession?.id])

  const handleCreate = async (connection: Partial<Connection>) => {
    if (!activeSession) return

    try {
      const response = await connectionsApi.create(activeSession.id, connection)
      setConnections([...connections, response.data])
      setShowForm(false)
    } catch (error) {
      console.error('Failed to create connection:', error)
      throw error
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete connection "${name}"?`)) {
      return
    }

    try {
      await connectionsApi.delete(id)
      setConnections(connections.filter((c) => c.id !== id))
    } catch (error) {
      console.error('Failed to delete connection:', error)
    }
  }

  if (!activeSession) {
    return null
  }

  return (
    <div className="connection-panel">
      <div className="panel-header">
        <h2>Connections</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Add Connection
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading connections...</div>
      ) : connections.length === 0 ? (
        <div className="empty-state">
          <p>No connections yet. Add your first connection to get started.</p>
        </div>
      ) : (
        <div className="connection-list">
          {connections.map((connection) => (
            <div key={connection.id} className="connection-card">
              <div className="connection-card-header">
                <div className="connection-info">
                  <h3>{connection.name}</h3>
                  <span className="connection-type">{connection.type}</span>
                </div>
                <button
                  className="btn-icon btn-danger"
                  onClick={() => handleDelete(connection.id, connection.name)}
                  title="Delete connection"
                >
                  ×
                </button>
              </div>

              <div className="connection-status">
                <span className={`status status-${connection.status}`}>
                  {connection.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ConnectionForm
          onSave={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
