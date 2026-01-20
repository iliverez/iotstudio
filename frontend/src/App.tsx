import { useState } from 'react'
import { MainContent } from './components/layout/MainContent'
import { SessionManager } from './components/session/SessionManager'
import { ConnectionPanel } from './components/connection/ConnectionPanel'
import { Dashboard } from './components/dashboard/Dashboard'
import type { Widget } from './types'
import './index.css'

export default function App() {
  const [currentView, setCurrentView] = useState<'sessions' | 'connections' | 'dashboard'>('sessions')

  const sampleWidgets: Widget[] = [
    {
      id: 'status-1',
      type: 'statuscard',
      title: 'Connection Status',
      config: { status: 'connected', label: 'Status' },
      layout: { x: 0, y: 0, w: 4, h: 3 },
    },
    {
      id: 'gauge-1',
      type: 'gauge',
      title: 'Temperature',
      config: { value: 23.5, min: 0, max: 100, unit: '°C' },
      layout: { x: 4, y: 0, w: 4, h: 5 },
    },
  ]

  return (
    <div className="app">
      <header>
        <h1>IoTStudio</h1>
        <nav>
          <button
            className={`nav-btn ${currentView === 'sessions' ? 'active' : ''}`}
            onClick={() => setCurrentView('sessions')}
          >
            Sessions
          </button>
          <button
            className={`nav-btn ${currentView === 'connections' ? 'active' : ''}`}
            onClick={() => setCurrentView('connections')}
          >
            Connections
          </button>
          <button
            className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentView('dashboard')}
          >
            Dashboard
          </button>
        </nav>
      </header>

      <MainContent>
        {currentView === 'sessions' && <SessionManager />}
        {currentView === 'connections' && <ConnectionPanel />}
        {currentView === 'dashboard' && <Dashboard widgets={sampleWidgets} />}
      </MainContent>
    </div>
  )
}
