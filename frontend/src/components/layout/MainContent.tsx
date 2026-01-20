import React from 'react'
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
          <>
            <header className="content-header">
              <h1>{activeSession.name}</h1>
              <div className="session-meta">
                <span className={`status-badge status-${activeSession.status}`}>
                  {activeSession.status}
                </span>
              </div>
            </header>
            <main className="content-body">{children}</main>
          </>
        ) : (
          <div className="empty-session">
            <div className="empty-icon">📊</div>
            <h2>No session selected</h2>
            <p>Select a session from the sidebar or create a new one to get started</p>
          </div>
        )}
      </div>
    </div>
  )
}
