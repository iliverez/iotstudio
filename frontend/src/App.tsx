import { useState } from 'react'
import { MainContent } from './components/layout/MainContent'
import { SessionManager } from './components/session/SessionManager'
import { SessionDetail } from './components/session/SessionDetail'
import { MonitoringSessions } from './components/device/MonitoringSessions'
import './index.css'

type View = 'sessions' | 'session-detail' | 'monitoring-sessions'

export default function App() {
  const [currentView, setCurrentView] = useState<View>('sessions')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  const navigateToSession = (sessionId: string) => {
    setSelectedSessionId(sessionId)
    setCurrentView('session-detail')
  }

  const navigateBack = () => {
    setSelectedSessionId(null)
    setCurrentView('sessions')
  }

  const navigateToMonitoringSessions = () => {
    setCurrentView('monitoring-sessions')
  }

  return (
    <div className="app">
      <header>
        <h1>IoTStudio</h1>
        <nav>
          {selectedSessionId && (
            <button className="nav-btn" onClick={navigateBack}>
              ← Back to Sessions
            </button>
          )}
          <button className="nav-btn" onClick={navigateToMonitoringSessions}>
            📊 Monitoring Sessions
          </button>
        </nav>
      </header>

      <MainContent>
        {currentView === 'sessions' && <SessionManager onSessionSelect={navigateToSession} />}
        {currentView === 'session-detail' && selectedSessionId && (
          <SessionDetail sessionId={selectedSessionId} />
        )}
        {currentView === 'monitoring-sessions' && (
          <MonitoringSessions onClose={navigateBack} />
        )}
      </MainContent>
    </div>
  )
}
