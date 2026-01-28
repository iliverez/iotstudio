import { useState } from 'react'
import { MainContent } from './components/layout/MainContent'
import { SessionManager } from './components/session/SessionManager'
import { SessionDetail } from './components/session/SessionDetail'
import './index.css'

type View = 'sessions' | 'session-detail'

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

  return (
    <div className="app">
      <header>
        <h1>IoTStudio</h1>
        {selectedSessionId && (
          <nav>
            <button className="nav-btn" onClick={navigateBack}>
              ← Back to Sessions
            </button>
          </nav>
        )}
      </header>

      <MainContent>
        {currentView === 'sessions' && <SessionManager onSessionSelect={navigateToSession} />}
        {currentView === 'session-detail' && selectedSessionId && (
          <SessionDetail sessionId={selectedSessionId} />
        )}
      </MainContent>
    </div>
  )
}
