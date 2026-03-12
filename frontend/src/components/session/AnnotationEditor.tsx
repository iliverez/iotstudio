import { useState, useEffect } from 'react'
import { annotationsApi } from '@/api/client'
import type { Annotation, AnnotationType, AnnotationPoint } from '@/types'
import './AnnotationEditor.css'

interface AnnotationEditorProps {
  monitoringSessionId: string
  onClose: () => void
  onSave: (annotation: Annotation) => void
  editingAnnotation?: Annotation | null
  annotationType?: AnnotationType
  initialRegion?: { start: number; end: number }
  initialPoints?: AnnotationPoint[]
}

export function AnnotationEditor({
  monitoringSessionId,
  onClose,
  onSave,
  editingAnnotation,
  annotationType,
  initialRegion,
  initialPoints,
}: AnnotationEditorProps) {
  const [title, setTitle] = useState(editingAnnotation?.title || '')
  const [text, setText] = useState(editingAnnotation?.text || '')
  const [type, setType] = useState<AnnotationType>(editingAnnotation?.type || annotationType || 'region')
  const [regionStart, setRegionStart] = useState<number>(0)
  const [regionEnd, setRegionEnd] = useState<number>(0)
  const [points, setPoints] = useState<AnnotationPoint[]>([])
  const [pointInput, setPointInput] = useState<{ signalName: string; value: number; timestamp: number }>({
    signalName: '',
    value: 0,
    timestamp: 0,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (editingAnnotation) {
      setTitle(editingAnnotation.title || '')
      setText(editingAnnotation.text || '')
      setRegionStart(editingAnnotation.regionStart || 0)
      setRegionEnd(editingAnnotation.regionEnd || 0)
      setPoints(editingAnnotation.points || [])
    } else if (initialRegion) {
      setRegionStart(initialRegion.start)
      setRegionEnd(initialRegion.end)
    } else {
      setTitle('')
      setText('')
      setRegionStart(0)
      setRegionEnd(0)
    }
  }, [editingAnnotation, initialRegion])

  useEffect(() => {
    if (initialPoints && initialPoints.length > 0) {
      setPoints(initialPoints)
      setPointInput({
        signalName: initialPoints[0]?.signalName || '',
        value: initialPoints[0]?.value || 0,
        timestamp: initialPoints[0]?.timestamp || 0,
      })
    }
  }, [initialPoints])

  const toDateTimeLocal = (timestamp: number): string => {
    if (!timestamp || timestamp <= 0) return ''
    const date = new Date(timestamp)
    const offset = date.getTimezoneOffset() * 60000
    return new Date(date.getTime() - offset).toISOString().slice(0, 16)
  }

  const fromDateTimeLocal = (value: string): number => {
    if (!value) return 0
    return new Date(value).getTime()
  }

  const handleAddPoint = () => {
    if (!pointInput.signalName) return
    setPoints([...points, { ...pointInput }])
    setPointInput({ signalName: '', value: 0, timestamp: 0 })
  }

  const handleRemovePoint = (index: number) => {
    setPoints(points.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const annotationData: Partial<Annotation> = {
        monitoringSessionId,
        type,
        title,
        text,
        points,
      }

      if (type === 'region') {
        annotationData.regionStart = regionStart
        annotationData.regionEnd = regionEnd
      }

      let savedAnnotation: Annotation
      if (editingAnnotation) {
        const response = await annotationsApi.update(editingAnnotation.id, annotationData)
        savedAnnotation = response.data
      } else {
        const response = await annotationsApi.create(annotationData)
        savedAnnotation = response.data
      }

      onSave(savedAnnotation)
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save annotation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="annotation-editor-overlay" onClick={onClose}>
      <div className="annotation-editor-modal" onClick={e => e.stopPropagation()}>
        <div className="annotation-editor-header">
          <h3>{editingAnnotation ? 'Edit Annotation' : 'Add Annotation'}</h3>
          <button className="btn-icon" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="annotation-editor-form">
          {error && (
            <div className="error-message">
              {error}
              <button className="btn-icon" onClick={() => setError(null)}>×</button>
            </div>
          )}

          <div className="form-group">
            <label>Type</label>
            <select value={type} onChange={e => setType(e.target.value as AnnotationType)} disabled={!!annotationType}>
              <option value="region">Region</option>
              <option value="point">Point</option>
            </select>
          </div>

          <div className="form-group">
            <label>Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Enter annotation title..."
            />
          </div>

          {type === 'region' && (
            <>
              <div className="form-group">
                <label>Region Start</label>
                <div className="timestamp-input">
                  <input
                    type="datetime-local"
                    value={toDateTimeLocal(regionStart)}
                    onChange={e => setRegionStart(fromDateTimeLocal(e.target.value))}
                    className="datetime-input"
                  />
                  <span className="timestamp-ms">
                    {regionStart > 0 ? `${regionStart} ms` : ''}
                  </span>
                </div>
              </div>
              <div className="form-group">
                <label>Region End</label>
                <div className="timestamp-input">
                  <input
                    type="datetime-local"
                    value={toDateTimeLocal(regionEnd)}
                    onChange={e => setRegionEnd(fromDateTimeLocal(e.target.value))}
                    className="datetime-input"
                  />
                  <span className="timestamp-ms">
                    {regionEnd > 0 ? `${regionEnd} ms` : ''}
                  </span>
                </div>
              </div>
            </>
          )}

          {type === 'point' && (
            <div className="form-group">
              <label>Points</label>
              <div className="points-list">
                {points.map((point, index) => (
                  <div key={index} className="point-item">
                    <span>{point.signalName}: {point.value} @ {new Date(point.timestamp).toLocaleString()}</span>
                    <button type="button" className="btn-icon btn-small" onClick={() => handleRemovePoint(index)}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="point-input">
                <input
                  type="text"
                  placeholder="Signal name"
                  value={pointInput.signalName}
                  onChange={e => setPointInput({ ...pointInput, signalName: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="Value"
                  value={pointInput.value}
                  onChange={e => setPointInput({ ...pointInput, value: Number(e.target.value) })}
                />
                <input
                  type="datetime-local"
                  placeholder="Timestamp"
                  value={toDateTimeLocal(pointInput.timestamp)}
                  onChange={e => setPointInput({ ...pointInput, timestamp: fromDateTimeLocal(e.target.value) })}
                  className="datetime-input"
                />
                <button type="button" className="btn btn-small" onClick={handleAddPoint}>+</button>
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Comment</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              required
              rows={4}
              placeholder="Enter your annotation comment..."
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : editingAnnotation ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
