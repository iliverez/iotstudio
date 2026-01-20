import React from 'react'
import './WidgetContainer.css'

interface WidgetContainerProps {
  title: string
  children?: React.ReactNode
}

export function WidgetContainer({ title, children }: WidgetContainerProps) {
  return (
    <div className="widget-container">
      <div className="widget-header">
        <h3>{title}</h3>
      </div>
      <div className="widget-body">
        {children || <div className="widget-placeholder">No content</div>}
      </div>
    </div>
  )
}
