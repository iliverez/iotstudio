# Usage Guide

This guide helps you get started with IoTStudio.

## Quick Start

1. Start the backend server
2. Open the frontend in your browser
3. Create a new session
4. Add a Modbus connection
5. Define devices and parsers
6. Build your dashboard

## Creating a Session

1. Click "New Session" in the session manager
2. Enter a name for your session (e.g., "Factory Floor Monitoring")
3. Click "Create"

## Adding a Modbus Connection

### Modbus TCP

1. Navigate to your session
2. Click "Add Connection" → "Modbus TCP"
3. Configure:
   - **Name**: PLC Connection
   - **Host**: 192.168.1.100 (device IP)
   - **Port**: 502 (default Modbus port)
   - **Timeout**: 5 seconds
   - **Keep Alive**: Enabled
4. Click "Connect"

### Modbus RTU

1. Click "Add Connection" → "Modbus RTU"
2. Configure:
   - **Name**: Serial Connection
   - **Port**: /dev/ttyUSB0 (Linux) or COM3 (Windows)
   - **Baud Rate**: 9600
   - **Data Bits**: 8
   - **Parity**: None
   - **Stop Bits**: 1
3. Click "Connect"

## Defining Devices

1. Go to your session's device list
2. Click "Add Device"
3. Configure:
   - **Name**: Temperature Sensor
   - **Connection**: Select connection
   - **Address**: 1 (Modbus slave ID)
   - **Parser**: Select or create parser
4. Click "Save"

## Creating Parsers

### Visual Parser

1. Go to Parsers section
2. Click "New Parser" → "Visual Editor"
3. Add rules:
   - **Name**: temperature
   - **Data Type**: Float
   - **Start Offset**: 0
   - **Bit Offset**: 0
   - **Bit Width**: 16
   - **Endianness**: Big
   - **Scale**: 0.1
   - **Offset**: 0
4. Test with sample data
5. Save parser

### JavaScript Parser

1. Click "New Parser" → "JavaScript Editor"
2. Write parsing function:

```javascript
function parse(buffer) {
  return {
    temperature: buffer.readFloatLE(0),
    humidity: buffer.readFloatLE(4),
    status: buffer.readUInt8(8)
  }
}
```

3. Test with sample data
4. Save parser

## Building Dashboards

1. Navigate to Dashboard view
2. Click "Add Widget"
3. Select widget type:
   - **Line Chart**: For time-series data
   - **Gauge**: For single values
   - **Data Grid**: For tabular data
   - **Status Card**: For connection status
4. Configure widget:
   - Select data source (device and metric)
   - Set refresh rate
   - Customize appearance
5. Drag to arrange widgets

## Common Use Cases

### Monitoring Temperature Sensors

1. Create session
2. Add Modbus RTU connection
3. Add device for each sensor
4. Create visual parser for temperature (16-bit, scale 0.1)
5. Add gauge widgets for each sensor

### Industrial PLC Monitoring

1. Create session
2. Add Modbus TCP connection to PLC
3. Add devices for each register group
4. Create parsers for different data types
5. Add line charts for trends
6. Add status cards for alarms

### Building Automation

1. Create session
2. Add connections to multiple controllers
3. Define devices for HVAC, lighting, security
4. Create parsers for each controller type
5. Build comprehensive dashboard

## Tips and Best Practices

1. **Connection Management**
   - Use keep-alive for TCP connections
   - Set appropriate timeout values
   - Monitor connection metrics

2. **Data Parsing**
   - Use visual parsers for simple cases
   - Use JavaScript for complex logic
   - Test parsers with real data

3. **Dashboard Performance**
   - Limit widgets per dashboard
   - Use appropriate refresh rates
   - Avoid displaying too many data points

4. **Session Organization**
   - Group related connections in sessions
   - Use descriptive names
   - Document your configuration

## Troubleshooting

### Connection Issues

1. Verify device IP address and port
2. Check firewall settings
3. Ensure device is powered on
4. Review connection logs

### Data Not Appearing

1. Verify parser configuration
2. Check device address
3. Ensure session is running
4. Review parser test results

### Dashboard Not Updating

1. Check WebSocket connection status
2. Verify session is subscribed
3. Check browser console for errors
4. Ensure data points are being received
