import { useState, useEffect } from 'react'
import { sessionsApi } from '@/api/client'
import { useDashboardStore } from '@/stores/dashboardStore'
import { SessionForm } from './SessionForm'
import './SessionManager.css'

export function SessionManager() {
  const { sessions, setSessions } = useDashboardStore()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  console.log('SessionManager rendering', { sessions, showForm, loading })

  const loadSessions = async () => {
    console.log('Loading sessions...')
    setLoading(true)
    setError(null)
    try {
      const response = await sessionsApi.list()
      console.log('Sessions loaded:', response.data)
      setSessions(response.data)
    } catch (error) {
      console.error('Failed to load sessions:', error)
      setError('Failed to load sessions: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
  }, [])

  const handleCreate = async (name: string) => {
    try {
      const response = await sessionsApi.create({ name })
      setSessions([...sessions, response.data])
      setShowForm(false)
    } catch (error) {
      console.error('Failed to create session:', error)
      throw error
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete session "${name}"?`)) {
      return
    }

    try {
      await sessionsApi.delete(id)
      setSessions(sessions.filter((s) => s.id !== id))
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  if (error) {
    return <div className="error-message">Error: {error}</div>
  }

  if (loading) {
    return <div className="loading">Loading sessions...</div>
  }

  return (
    <div className="session-manager">
      <div className="session-manager-header">
        <h2>Sessions</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + New Session
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="empty-state">
          <p>No sessions yet. Create your first session to get started.</p>
        </div>
      ) : (
        <div className="session-grid">
          {sessions.map((session) => (
            <div key={session.id} className="session-card">
              <div className="session-card-header">
                <h3>{session.name}</h3>
                <button
                  className="btn-icon btn-danger"
                  onClick={() => handleDelete(session.id, session.name)}
                  title="Delete session"
                >
                  ×
                </button>
              </div>
              <div className="session-card-body">
                <div className="session-info">
                  <span className={`status status-${session.status}`}>
                    {session.status}
                  </span>
                  <span className="session-date">
                    {new Date(session.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && <SessionForm onSave={handleCreate} onClose={() => setShowForm(false)} />}
    </div>
  )
}
