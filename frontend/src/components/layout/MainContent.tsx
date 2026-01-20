import { useDashboardStore } from '@/stores/dashboardStore'
import { Sidebar } from './Sidebar'
import './MainContent.css'

interface MainContentProps {
  children: React.ReactNode
}

export function MainContent({ children }: MainContentProps) {
  const { activeSession } = useDashboardStore()

  return (
    <div className="main-content">
      <Sidebar />
      <div className="content-area">
        <div className="content-header-spacer">
          {activeSession ? (
            <header className="content-header">
              <h1>{activeSession.name}</h1>
              <div className="session-meta">
                <span className={`status-badge status-${activeSession.status}`}>
                  {activeSession.status}
                </span>
              </div>
            </header>
          ) : (
            <header className="content-header">
              <h1>Sessions</h1>
            </header>
          )}
        </div>
        <main className="content-body">{children}</main>
      </div>
    </div>
  )
}
