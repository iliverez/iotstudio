import { useState, useEffect } from 'react'
import { parsersApi } from '@/api/client'
import { ParserForm } from './ParserForm'
import type { Parser } from '@/types'
import './ParsersTab.css'

interface ParsersTabProps {
  onUpdate?: () => void
  onSelectParser?: (parserId: string) => void
  selectedParserId?: string
}

export function ParsersTab({ onUpdate, onSelectParser, selectedParserId }: ParsersTabProps) {
  const [parsers, setParsers] = useState<Parser[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingParser, setEditingParser] = useState<Parser | undefined>()

  const loadParsers = async () => {
    try {
      setLoading(true)
      const response = await parsersApi.list()
      setParsers(response.data || [])
    } catch (error) {
      console.error('Failed to load parsers:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadParsers()
  }, [])

  const handleCreateParser = async () => {
    await loadParsers()
    setShowForm(false)
    setEditingParser(undefined)
    onUpdate?.()
  }

  const handleEditParser = (parser: Parser) => {
    setEditingParser(parser)
    setShowForm(true)
  }

  const handleDeleteParser = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete parser "${name}"?`)) {
      return
    }

    try {
      await parsersApi.delete(id)
      await loadParsers()
      onUpdate?.()
    } catch (error) {
      console.error('Failed to delete parser:', error)
    }
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setEditingParser(undefined)
  }

  const getParserTypeLabel = (parser: Parser) => {
    if (parser.type === 'modbus') {
      return 'Modbus'
    }
    if (parser.type === 'builtin' || parser.builtinType) {
      return `Built-in: ${parser.builtinType || 'Unknown'}`
    }
    return parser.type === 'visual' ? 'Visual' : 'JavaScript'
  }

  const getFieldCount = (parser: Parser) => {
    if (parser.type === 'modbus') {
      return parser.modbusRegisters?.length || 0
    }
    return parser.fields?.length || 0
  }

  const truncateDescription = (description?: string, maxLength: number = 120) => {
    if (!description) return ''
    if (description.length <= maxLength) return description
    return description.substring(0, maxLength) + '...'
  }

  if (loading) {
    return (
      <div className="parsers-tab">
        <div className="loading-state">Loading parsers...</div>
      </div>
    )
  }

  return (
    <div className="parsers-tab">
      <div className="tab-header">
        <h3>Parsers</h3>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Create Parser
        </button>
      </div>

      {parsers.length === 0 ? (
        <div className="empty-state">
          <p>No parsers defined yet. Create a parser to parse device data.</p>
          <p className="hint">
            Parsers define how raw bytes are converted into meaningful values.
            You can use built-in parsers for common formats, Modbus parsers for register-based reading, or create custom ones.
          </p>
        </div>
      ) : (
        <div className="parsers-list">
          {parsers.map((parser) => (
            <div
              key={parser.id}
              className={`parser-card ${selectedParserId === parser.id ? 'selected' : ''}`}
              onClick={() => onSelectParser?.(parser.id)}
            >
              <div className="parser-card-header">
                <div className="parser-info">
                  <h4>{parser.name}</h4>
                  <span className="parser-type">{getParserTypeLabel(parser)}</span>
                </div>
                <div className="parser-actions">
                  <button
                    className="btn-icon btn-edit"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEditParser(parser)
                    }}
                    title="Edit parser"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                  </button>
                  <button
                    className="btn-icon btn-danger"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteParser(parser.id, parser.name)
                    }}
                    title="Delete parser"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
              <div className="parser-card-body">
                <div className="parser-detail">
                  <span className="label">{parser.type === 'modbus' ? 'Registers:' : 'Fields:'}</span>
                  <span className="value">{getFieldCount(parser)}</span>
                </div>
                {parser.description && (
                  <div className="parser-description" title={parser.description}>
                    {truncateDescription(parser.description)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ParserForm
          parser={editingParser}
          onSave={handleCreateParser}
          onClose={handleCloseForm}
        />
      )}
    </div>
  )
}
