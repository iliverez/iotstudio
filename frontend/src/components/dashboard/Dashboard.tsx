import { Responsive, Layout } from 'react-grid-layout'
import WidthProvider from 'react-grid-layout'
import { StatusCard } from './StatusCard'
import { WidgetContainer } from './WidgetContainer'
import type { Widget } from '@/types'
import 'react-grid-layout/css/styles.css'
import './Dashboard.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

interface DashboardProps {
  widgets?: Widget[]
  onLayoutChange?: (layout: Layout[]) => void
}

export function Dashboard({ widgets = [], onLayoutChange }: DashboardProps) {
  const layouts = widgets.map((w) => ({ i: w.id, ...w.layout }))

  const handleLayoutChange = (currentLayout: Layout[]) => {
    onLayoutChange?.(currentLayout)
  }

  const renderWidget = (widget: Widget) => {
    const commonProps = {
      title: widget.title,
      config: widget.config,
    }

    switch (widget.type) {
      case 'statuscard':
        return <StatusCard {...commonProps} />
      default:
        return <WidgetContainer {...commonProps} />
    }
  }

  if (widgets.length === 0) {
    return (
      <div className="dashboard-empty">
        <div className="dashboard-empty-icon">📊</div>
        <h2>Dashboard is empty</h2>
        <p>Add widgets to start visualizing your data</p>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <ResponsiveGridLayout
        className="layout"
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4 }}
        rowHeight={60}
        layouts={{
          lg: layouts,
          md: layouts,
          sm: layouts.map((l) => ({ ...l, w: 6, x: 0, y: Infinity })),
          xs: layouts.map((l) => ({ ...l, w: 3, x: 0, y: Infinity })),
        }}
        onLayoutChange={handleLayoutChange}
        isDraggable={true}
        isResizable={true}
      >
        {widgets.map((widget) => (
          <div key={widget.id}>
            {renderWidget(widget)}
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  )
}
