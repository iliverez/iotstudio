import { useDashboardStore } from '@/stores/dashboardStore'
import './Sidebar.css'

export function Sidebar() {
  const { sessions, activeSessionId, setActiveSession } = useDashboardStore()

  const handleSessionClick = (id: string) => {
    setActiveSession(id)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Sessions</h2>
      </div>
      <div className="sidebar-content">
        {sessions.length === 0 ? (
          <p className="empty-state">No sessions yet</p>
        ) : (
          <ul className="session-list">
            {sessions.map((session) => (
              <li
                key={session.id}
                className={`session-item ${activeSessionId === session.id ? 'active' : ''}`}
                onClick={() => handleSessionClick(session.id)}
              >
                <div className="session-name">{session.name}</div>
                <div className="session-status">{session.status}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
