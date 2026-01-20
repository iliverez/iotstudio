interface ModbusRTUFormProps {
  config: Record<string, unknown>
  onChange: (config: Record<string, unknown>) => void
  disabled?: boolean
}

export function ModbusRTUForm({ config, onChange, disabled }: ModbusRTUFormProps) {
  const handleChange = (field: string, value: string | number) => {
    onChange({ ...config, [field]: value })
  }

  return (
    <div className="modbus-form">
      <h4>Modbus RTU Configuration</h4>

      <div className="form-group">
        <label htmlFor="port">Serial Port</label>
        <input
          id="port"
          type="text"
          value={(config.port as string) || ''}
          onChange={(e) => handleChange('port', e.target.value)}
          placeholder="/dev/ttyUSB0 or COM3"
          disabled={disabled}
        />
      </div>

      <div className="form-group">
        <label htmlFor="baudRate">Baud Rate</label>
        <select
          id="baudRate"
          value={(config.baudRate as number) || 9600}
          onChange={(e) => handleChange('baudRate', parseInt(e.target.value, 10))}
          disabled={disabled}
        >
          <option value="1200">1200</option>
          <option value="2400">2400</option>
          <option value="4800">4800</option>
          <option value="9600">9600</option>
          <option value="19200">19200</option>
          <option value="38400">38400</option>
          <option value="57600">57600</option>
          <option value="115200">115200</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="dataBits">Data Bits</label>
        <select
          id="dataBits"
          value={(config.dataBits as number) || 8}
          onChange={(e) => handleChange('dataBits', parseInt(e.target.value, 10))}
          disabled={disabled}
        >
          <option value="7">7</option>
          <option value="8">8</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="parity">Parity</label>
        <select
          id="parity"
          value={(config.parity as string) || 'N'}
          onChange={(e) => handleChange('parity', e.target.value)}
          disabled={disabled}
        >
          <option value="N">None</option>
          <option value="O">Odd</option>
          <option value="E">Even</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="stopBits">Stop Bits</label>
        <select
          id="stopBits"
          value={(config.stopBits as number) || 1}
          onChange={(e) => handleChange('stopBits', parseInt(e.target.value, 10))}
          disabled={disabled}
        >
          <option value="1">1</option>
          <option value="2">2</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="timeout">Timeout (milliseconds)</label>
        <input
          id="timeout"
          type="number"
          value={(config.timeout as number) || 5000}
          onChange={(e) => handleChange('timeout', parseInt(e.target.value, 10))}
          placeholder="5000"
          disabled={disabled}
        />
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
