interface ModbusTCPFormProps {
  config: Record<string, unknown>
  onChange: (config: Record<string, unknown>) => void
  disabled?: boolean
}

export function ModbusTCPForm({ config, onChange, disabled }: ModbusTCPFormProps) {
  const handleChange = (field: string, value: string | number | boolean) => {
    onChange({ ...config, [field]: value })
  }

  return (
    <div className="modbus-form">
      <h4>Modbus TCP Configuration</h4>

      <div className="form-group">
        <label htmlFor="host">Host</label>
        <input
          id="host"
          type="text"
          value={(config.host as string) || ''}
          onChange={(e) => handleChange('host', e.target.value)}
          placeholder="192.168.1.100"
          disabled={disabled}
        />
      </div>

      <div className="form-group">
        <label htmlFor="port">Port</label>
        <input
          id="port"
          type="number"
          value={(config.port as number) || 502}
          onChange={(e) => handleChange('port', parseInt(e.target.value, 10))}
          placeholder="502"
          disabled={disabled}
        />
      </div>

      <div className="form-group">
        <label htmlFor="timeout">Timeout (seconds)</label>
        <input
          id="timeout"
          type="number"
          value={(config.timeout as number) || 5}
          onChange={(e) => handleChange('timeout', parseInt(e.target.value, 10))}
          placeholder="5"
          disabled={disabled}
        />
      </div>

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={(config.keepAlive as boolean) || false}
            onChange={(e) => handleChange('keepAlive', e.target.checked)}
            disabled={disabled}
          />
          Keep Alive
        </label>
      </div>

      <div className="form-group">
        <label htmlFor="maxRetries">Max Retries</label>
        <input
          id="maxRetries"
          type="number"
          value={(config.maxRetries as number) || 3}
          onChange={(e) => handleChange('maxRetries', parseInt(e.target.value, 10))}
          placeholder="3"
          disabled={disabled}
        />
      </div>

      <div className="form-group">
        <label htmlFor="retryDelay">Retry Delay (milliseconds)</label>
        <input
          id="retryDelay"
          type="number"
          value={(config.retryDelay as number) || 1000}
          onChange={(e) => handleChange('retryDelay', parseInt(e.target.value, 10))}
          placeholder="1000"
          disabled={disabled}
        />
      </div>
    </div>
  )
}
