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
        {activeSession ? (
          <header className="content-header">
            <h1>{activeSession.name}</h1>
            <div className="session-meta">
              <span className={`status-badge status-${activeSession.status}`}>
                {activeSession.status}
              </span>
            </div>
          </header>
        ) : null}
        <main className="content-body">{children}</main>
      </div>
    </div>
  )
}
