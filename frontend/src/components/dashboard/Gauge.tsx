import { WidgetContainer } from './WidgetContainer'
import './Gauge.css'

interface GaugeProps {
  title: string
  config: Record<string, unknown>
}

export function Gauge({ title, config }: GaugeProps) {
  const value = (config.value as number) || 0
  const min = (config.min as number) || 0
  const max = (config.max as number) || 100
  const unit = (config.unit as string) || ''

  const normalizedValue = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const rotation = normalizedValue * 180 - 90

  return (
    <WidgetContainer title={title}>
      <div className="gauge">
        <div className="gauge-body">
          <svg className="gauge-svg" viewBox="0 0 200 100">
            <path
              d="M 10 100 A 90 90 0 0 1 190 100"
              fill="none"
              stroke="#2a2a2a"
              strokeWidth="20"
            />
            <path
              d="M 10 100 A 90 90 0 0 1 190 100"
              fill="none"
              stroke="#0088ff"
              strokeWidth="20"
              strokeDasharray={`${normalizedValue * 282.7} 282.7`}
              style={{ transform: 'rotate(180deg)', transformOrigin: '100px 100px' }}
            />
            <line
              x1="100"
              y1="100"
              x2={100 + 70 * Math.cos((rotation * Math.PI) / 180)}
              y2={100 + 70 * Math.sin((rotation * Math.PI) / 180)}
              stroke="#fff"
              strokeWidth="3"
            />
            <circle cx="100" cy="100" r="5" fill="#fff" />
          </svg>
        </div>
        <div className="gauge-value">
          {typeof value === 'number' ? value.toFixed(2) : value} {unit}
        </div>
      </div>
    </WidgetContainer>
  )
}
