import { WidgetContainer } from './WidgetContainer'
import './StatusCard.css'

interface StatusCardProps {
  title: string
  config: Record<string, unknown>
}

export function StatusCard({ title, config }: StatusCardProps) {
  const status = (config.status as string) || 'unknown'
  const label = (config.label as string) || 'Status'

  const getStatusColor = () => {
    switch (status.toLowerCase()) {
      case 'connected':
      case 'running':
        return '#28a745'
      case 'disconnected':
      case 'idle':
        return '#666'
      case 'connecting':
      case 'paused':
        return '#ffc107'
      case 'error':
        return '#dc3545'
      default:
        return '#666'
    }
  }

  return (
    <WidgetContainer title={title}>
      <div className="status-card">
        <div className="status-card-label">{label}</div>
        <div className="status-card-value">
          <div
            className="status-indicator"
            style={{ backgroundColor: getStatusColor() }}
          />
          <span className="status-text">{status}</span>
        </div>
      </div>
    </WidgetContainer>
  )
}
