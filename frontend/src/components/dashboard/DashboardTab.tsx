import { Dashboard } from './Dashboard'
import './DashboardTab.css'

interface DashboardTabProps {
  sessionId: string
}

export function DashboardTab({ sessionId }: DashboardTabProps) {
  console.log('Dashboard for session:', sessionId)
  return (
    <div className="dashboard-tab">
      <Dashboard />
    </div>
  )
}
