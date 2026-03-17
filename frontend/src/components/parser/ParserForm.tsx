import { useState, useEffect } from 'react'
import { parsersApi, engineeringUnitsApi } from '@/api/client'
import type { Parser, ParserField, ModbusRegister, EngineeringUnit } from '@/types'
import './ParserForm.css'

interface ParserFormProps {
  parser?: Parser
  onSave: (parser: Partial<Parser>) => Promise<void>
  onClose: () => void
  deviceId?: string
}

const BUILTIN_TYPES = [
  { value: '', label: 'Custom Parser' },
  { value: 'ieee_3_floats', label: 'IEEE 3 Floats (Little Endian)' },
  { value: 'ascii_3_floats', label: 'ASCII 3 Floats' },
  { value: 'int16_signed', label: 'Int16 Signed' },
  { value: 'int16_unsigned', label: 'Int16 Unsigned' },
  { value: 'int32_signed', label: 'Int32 Signed' },
  { value: 'raw_bytes', label: 'Raw Bytes' },
]

const PARSER_TYPES = [
  { value: 'visual', label: 'Visual Parser (Byte Offset)' },
  { value: 'modbus', label: 'Modbus Parser (Registers)' },
  { value: 'builtin', label: 'Built-in Parser' },
]

const DATA_TYPES = [
  'uint8',
  'int8',
  'uint16',
  'int16',
  'uint32',
  'int32',
  'float32',
  'float64',
  'ascii_int',
  'ascii_decimal',
  'string',
  'raw_bytes',
]

const MODBUS_DATA_TYPES = [
  { value: 'bool', label: 'B' },
  { value: 'int16', label: 'I16' },
  { value: 'uint16', label: 'U16' },
  { value: 'int32', label: 'I32' },
  { value: 'uint32', label: 'U32' },
  { value: 'float32', label: 'F32' },
  { value: 'float64', label: 'F64' },
]

const MODBUS_REGISTER_TYPES = [
  { value: 'coil', label: 'CL', description: 'Coil - Read/Write single bit (FC01/FC05)' },
  { value: 'discrete_input', label: 'DI', description: 'Discrete Input - Read-only single bit (FC02)' },
  { value: 'holding_register', label: 'HR', description: 'Holding Register - Read/Write 16-bit (FC03/FC06/FC16)' },
  { value: 'input_register', label: 'IR', description: 'Input Register - Read-only 16-bit (FC04)' },
]

const ENDIANNESS_OPTIONS = ['big', 'little']

const DEFAULT_FIELD: Omit<ParserField, 'deviceId'> = {
  name: '',
  dataType: 'uint16',
  offset: 0,
  bitOffset: 0,
  bitWidth: 0,
  endianness: 'big',
  scale: 1,
  valueOffset: 0,
  arrayLength: 0,
}

const DEFAULT_MODBUS_REGISTER: ModbusRegister = {
  name: '',
  registerType: 'holding_register',
  address: 0,
  quantity: 1,
  dataType: 'uint16',
  endianness: 'big',
  scale: 1,
  offset: 0,
}

export function ParserForm({ parser, onSave, onClose, deviceId }: ParserFormProps) {
  const [name, setName] = useState(parser?.name || '')
  const [description, setDescription] = useState(parser?.description || '')
  const [parserType, setParserType] = useState<'visual' | 'javascript' | 'builtin' | 'modbus'>(
    parser?.type || 'visual'
  )
  const [builtinType, setBuiltinType] = useState(parser?.builtinType || '')
  const [fields, setFields] = useState<ParserField[]>(
    parser?.fields?.length
      ? parser.fields
      : [{ ...DEFAULT_FIELD, deviceId: deviceId || '' }] as ParserField[]
  )
  const [modbusRegisters, setModbusRegisters] = useState<ModbusRegister[]>(
    parser?.modbusRegisters?.length
      ? parser.modbusRegisters
      : [{ ...DEFAULT_MODBUS_REGISTER }]
  )
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [engineeringUnits, setEngineeringUnits] = useState<EngineeringUnit[]>([])

  const isBuiltin = builtinType !== '' && parserType === 'builtin'

  useEffect(() => {
    // Load engineering units
    const loadEngineeringUnits = async () => {
      try {
        const response = await engineeringUnitsApi.list()
        setEngineeringUnits(response.data)
      } catch (err) {
        console.error('Failed to load engineering units:', err)
      }
    }
    loadEngineeringUnits()

    if (builtinType !== '' && parserType === 'builtin') {
      // Keep builtin type set
    }
  }, [builtinType, parserType])

  const handleAddField = () => {
    setFields([
      ...fields,
      { ...DEFAULT_FIELD, deviceId: deviceId || '' } as ParserField,
    ])
  }

  const handleRemoveField = (index: number) => {
    if (fields.length > 1) {
      setFields(fields.filter((_, i) => i !== index))
    }
  }

  const handleFieldChange = (
    index: number,
    key: keyof ParserField,
    value: string | number
  ) => {
    const newFields = [...fields]
    newFields[index] = { ...newFields[index], [key]: value }
    setFields(newFields)
  }

  const handleAddModbusRegister = () => {
    setModbusRegisters([...modbusRegisters, { ...DEFAULT_MODBUS_REGISTER }])
  }

  const handleRemoveModbusRegister = (index: number) => {
    if (modbusRegisters.length > 1) {
      setModbusRegisters(modbusRegisters.filter((_, i) => i !== index))
    }
  }

  const handleModbusRegisterChange = (
    index: number,
    key: keyof ModbusRegister,
    value: string | number
  ) => {
    const newRegisters = [...modbusRegisters]
    newRegisters[index] = { ...newRegisters[index], [key]: value }

    // Auto-adjust quantity based on data type
    if (key === 'dataType') {
      const dataType = value as string
      if (['int32', 'uint32', 'float32'].includes(dataType)) {
        newRegisters[index].quantity = 2
      } else if (dataType === 'float64') {
        newRegisters[index].quantity = 4
      } else {
        newRegisters[index].quantity = 1
      }
    }

    setModbusRegisters(newRegisters)
  }

  const handleCloneRegister = (index: number) => {
    const sourceRegister = modbusRegisters[index]
    const newRegister: ModbusRegister = {
      ...sourceRegister,
      name: `${sourceRegister.name}_copy`,
      address: sourceRegister.address + sourceRegister.quantity,
    }
    const newRegisters = [...modbusRegisters]
    newRegisters.splice(index + 1, 0, newRegister)
    setModbusRegisters(newRegisters)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Parser name is required')
      return
    }

    if (description.length > 500) {
      setError('Description must be less than 500 characters')
      return
    }

    if (parserType === 'visual' && fields.some((f) => !f.name.trim())) {
      setError('All fields must have a name')
      return
    }

    if (parserType === 'modbus' && modbusRegisters.some((r) => !r.name.trim())) {
      setError('All registers must have a name')
      return
    }

    setSubmitting(true)
    try {
      const parserData: Partial<Parser> = {
        name: name.trim(),
        description: description.trim() || undefined,
        type: isBuiltin ? 'builtin' : parserType,
        builtinType: isBuiltin ? builtinType : null,
        fields: isBuiltin
          ? [{ name: 'value', deviceId: deviceId || '', dataType: 'float32', offset: 0, bitOffset: 0, bitWidth: 0, endianness: 'little', scale: 1, valueOffset: 0, arrayLength: 0 }]
          : parserType === 'visual'
          ? fields.map((f) => ({
              ...f,
              deviceId: f.deviceId || deviceId || '',
            }))
          : [],
        modbusRegisters: parserType === 'modbus' ? modbusRegisters : undefined,
      }

      if (parser?.id) {
        await parsersApi.update(parser.id, parserData)
      } else {
        await parsersApi.create(parserData)
      }
      await onSave(parserData)
    } catch (err) {
      setError('Failed to save parser')
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large parser-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{parser?.id ? 'Edit Parser' : 'Create Parser'}</h2>
          <button className="btn-icon" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body parser-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="parser-name">Parser Name *</label>
              <input
                id="parser-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Parser"
                disabled={submitting}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="parser-type">Parser Type</label>
              <select
                id="parser-type"
                value={parserType}
                onChange={(e) => setParserType(e.target.value as 'visual' | 'javascript' | 'builtin' | 'modbus')}
                disabled={submitting}
              >
                {PARSER_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>
                    {pt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="parser-description">Description</label>
            <textarea
              id="parser-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description for this parser..."
              disabled={submitting}
              rows={3}
              maxLength={500}
            />
            <div className="character-count">{description.length} / 500</div>
          </div>

          {parserType === 'builtin' && (
            <div className="form-group">
              <label htmlFor="parser-builtin">Built-in Type</label>
              <select
                id="parser-builtin"
                value={builtinType}
                onChange={(e) => setBuiltinType(e.target.value)}
                disabled={submitting}
              >
                {BUILTIN_TYPES.map((bt) => (
                  <option key={bt.value} value={bt.value}>
                    {bt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {parserType === 'visual' && (
            <div className="fields-section">
              <div className="fields-header">
                <h3>Parser Fields</h3>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={handleAddField}
                  disabled={submitting}
                >
                  + Add Field
                </button>
              </div>

              <div className="fields-list">
                {fields.map((field, index) => (
                  <div key={index} className="field-row">
                    <div className="field-grid">
                      <div className="form-group">
                        <label>Field Name</label>
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) =>
                            handleFieldChange(index, 'name', e.target.value)
                          }
                          placeholder="temperature"
                          disabled={submitting}
                        />
                      </div>

                      <div className="form-group">
                        <label>Data Type</label>
                        <select
                          value={field.dataType}
                          onChange={(e) =>
                            handleFieldChange(index, 'dataType', e.target.value)
                          }
                          disabled={submitting}
                        >
                          {DATA_TYPES.map((dt) => (
                            <option key={dt} value={dt}>
                              {dt}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Byte Offset</label>
                        <input
                          type="number"
                          value={field.offset}
                          onChange={(e) =>
                            handleFieldChange(index, 'offset', parseInt(e.target.value) || 0)
                          }
                          min="0"
                          disabled={submitting}
                        />
                      </div>

                      <div className="form-group">
                        <label>Endianness</label>
                        <select
                          value={field.endianness}
                          onChange={(e) =>
                            handleFieldChange(index, 'endianness', e.target.value)
                          }
                          disabled={submitting}
                        >
                          {ENDIANNESS_OPTIONS.map((e) => (
                            <option key={e} value={e}>
                              {e}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Scale</label>
                        <input
                          type="number"
                          value={field.scale}
                          onChange={(e) =>
                            handleFieldChange(index, 'scale', parseFloat(e.target.value) || 1)
                          }
                          step="0.01"
                          disabled={submitting}
                        />
                      </div>

                      <div className="form-group">
                        <label>Value Offset</label>
                        <input
                          type="number"
                          value={field.valueOffset}
                          onChange={(e) =>
                            handleFieldChange(index, 'valueOffset', parseFloat(e.target.value) || 0)
                          }
                          step="0.01"
                          disabled={submitting}
                        />
                      </div>

                      <div className="form-group">
                        <label>Array Length</label>
                        <input
                          type="number"
                          value={field.arrayLength}
                          onChange={(e) =>
                            handleFieldChange(index, 'arrayLength', parseInt(e.target.value) || 0)
                          }
                          min="0"
                          disabled={submitting}
                        />
                      </div>

                      <div className="form-group field-actions">
                        <button
                          type="button"
                          className="btn btn-danger btn-small"
                          onClick={() => handleRemoveField(index)}
                          disabled={submitting || fields.length <= 1}
                          title="Remove field"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {parserType === 'modbus' && (
            <div className="fields-section modbus-section">
              <div className="fields-header">
                <h3>Modbus Registers</h3>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={handleAddModbusRegister}
                  disabled={submitting}
                >
                  + Add Register
                </button>
              </div>

              <div className="modbus-table-container">
                <div className="modbus-table-header">
                  <div className="modbus-header-cell">Name</div>
                  <div className="modbus-header-cell">Type</div>
                  <div className="modbus-header-cell">Address</div>
                  <div className="modbus-header-cell">Data Type</div>
                  <div className="modbus-header-cell">Qty</div>
                  <div className="modbus-header-cell">Endian</div>
                  <div className="modbus-header-cell">Scale</div>
                  <div className="modbus-header-cell">Offset</div>
                  <div className="modbus-header-cell">Unit</div>
                  <div className="modbus-header-cell actions">Actions</div>
                </div>

                <div className="modbus-table-body">
                  {modbusRegisters.map((reg, index) => (
                    <div key={index} className="modbus-table-row">
                      <div className="modbus-table-cell table-input">
                        <input
                          type="text"
                          value={reg.name}
                          onChange={(e) =>
                            handleModbusRegisterChange(index, 'name', e.target.value)
                          }
                          placeholder="temperature"
                          disabled={submitting}
                        />
                      </div>

                      <div className="modbus-table-cell table-select">
                        <select
                          value={reg.registerType}
                          onChange={(e) =>
                            handleModbusRegisterChange(index, 'registerType', e.target.value)
                          }
                          disabled={submitting}
                        >
                          {MODBUS_REGISTER_TYPES.map((rt) => (
                            <option key={rt.value} value={rt.value}>
                              {rt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="modbus-table-cell table-input">
                        <input
                          type="number"
                          value={reg.address}
                          onChange={(e) =>
                            handleModbusRegisterChange(index, 'address', parseInt(e.target.value) || 0)
                          }
                          min="0"
                          max="65535"
                          disabled={submitting}
                        />
                      </div>

                      <div className="modbus-table-cell table-select">
                        <select
                          value={reg.dataType}
                          onChange={(e) =>
                            handleModbusRegisterChange(index, 'dataType', e.target.value)
                          }
                          disabled={submitting}
                        >
                          {MODBUS_DATA_TYPES.map((dt) => (
                            <option key={dt.value} value={dt.value}>
                              {dt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="modbus-table-cell table-input">
                        <input
                          type="number"
                          value={reg.quantity}
                          onChange={(e) =>
                            handleModbusRegisterChange(index, 'quantity', parseInt(e.target.value) || 1)
                          }
                          min="1"
                          max="125"
                          disabled={submitting}
                        />
                      </div>

                      <div className="modbus-table-cell table-select">
                        <select
                          value={reg.endianness}
                          onChange={(e) =>
                            handleModbusRegisterChange(index, 'endianness', e.target.value)
                          }
                          disabled={submitting}
                        >
                          {ENDIANNESS_OPTIONS.map((e) => (
                            <option key={e} value={e}>
                              {e}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="modbus-table-cell table-input">
                        <input
                          type="number"
                          value={reg.scale}
                          onChange={(e) =>
                            handleModbusRegisterChange(index, 'scale', parseFloat(e.target.value) || 1)
                          }
                          step="0.01"
                          disabled={submitting}
                        />
                      </div>

                      <div className="modbus-table-cell table-input">
                        <input
                          type="number"
                          value={reg.offset}
                          onChange={(e) =>
                            handleModbusRegisterChange(index, 'offset', parseFloat(e.target.value) || 0)
                          }
                          step="0.01"
                          disabled={submitting}
                        />
                      </div>

                      <div className="modbus-table-cell table-select">
                        <select
                          value={reg.engineeringUnitId || ''}
                          onChange={(e) =>
                            handleModbusRegisterChange(index, 'engineeringUnitId', e.target.value)
                          }
                          disabled={submitting}
                        >
                          <option value="">None</option>
                          {engineeringUnits.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.symbol}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="modbus-table-cell table-actions">
                        <button
                          type="button"
                          className="btn btn-icon btn-clone"
                          onClick={() => handleCloneRegister(index)}
                          disabled={submitting}
                          title="Clone register with consecutive address"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-.55.45-1 1-1h10c.55 0 1 .45 1 1"/></svg>
                        </button>
                        <button
                          type="button"
                          className="btn btn-icon btn-danger"
                          onClick={() => handleRemoveModbusRegister(index)}
                          disabled={submitting || modbusRegisters.length <= 1}
                          title="Remove register"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="modbus-help">
                <h4>Register Type Reference</h4>
                <ul>
                  {MODBUS_REGISTER_TYPES.map((rt) => (
                    <li key={rt.value}>
                      <strong>{rt.label}:</strong> {rt.description}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {isBuiltin && (
            <div className="builtin-info">
              <p>
                <strong>{BUILTIN_TYPES.find((b) => b.value === builtinType)?.label}</strong>
              </p>
              <p className="builtin-description">
                {getBuiltinDescription(builtinType)}
              </p>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : parser?.id ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function getBuiltinDescription(builtinType: string): string {
  switch (builtinType) {
    case 'ieee_3_floats':
      return 'Parses 3 IEEE 754 float values (4 bytes each, little-endian). Total 12 bytes.'
    case 'ascii_3_floats':
      return 'Parses a single float from ASCII format: 4 digits integral + 4 digits decimal.'
    case 'int16_signed':
      return 'Parses a signed 16-bit integer (2 bytes).'
    case 'int16_unsigned':
      return 'Parses an unsigned 16-bit integer (2 bytes).'
    case 'int32_signed':
      return 'Parses a signed 32-bit integer (4 bytes).'
    case 'raw_bytes':
      return 'Returns raw bytes without any parsing.'
    default:
      return ''
  }
}
