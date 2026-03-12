import axios from 'axios'
import type { Session, Connection, Device, Parser, ConnectionState, DataPoint, MonitoringSession, EngineeringUnit, Annotation } from '@/types'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

export const sessionsApi = {
  list: () => api.get<Session[]>('/sessions'),
  get: (id: string) => api.get<Session>(`/sessions/${id}`),
  create: (data: Partial<Session>) => api.post<Session>('/sessions', data),
  update: (id: string, data: Partial<Session>) => api.put<Session>(`/sessions/${id}`, data),
  delete: (id: string) => api.delete(`/sessions/${id}`),
}

export const connectionsApi = {
  get: (id: string) => api.get<Connection>(`/connections/${id}`),
  update: (id: string, data: Partial<Connection>) =>
    api.put<Connection>(`/connections/${id}`, data),
  listBySession: (sessionId: string) =>
    api.get<Connection[]>(`/sessions/${sessionId}/connections`),
  create: (sessionId: string, data: Partial<Connection>) =>
    api.post<Connection>(`/sessions/${sessionId}/connections`, data),
  delete: (id: string) => api.delete(`/connections/${id}`),
  connect: (id: string) => api.post<Connection>(`/connections/${id}/connect`),
  disconnect: (id: string) => api.post<Connection>(`/connections/${id}/disconnect`),
  status: (id: string) => api.get<ConnectionState>(`/connections/${id}/status`),
}

export const devicesApi = {
  get: (id: string) => api.get<Device>(`/devices/${id}`),
  update: (id: string, data: Partial<Device>) =>
    api.put<Device>(`/devices/${id}`, data),
  listBySession: (sessionId: string) =>
    api.get<Device[]>(`/sessions/${sessionId}/devices`),
  listByConnection: (connectionId: string) =>
    api.get<Device[]>(`/connections/${connectionId}/devices`),
  create: (sessionId: string, data: Partial<Device>) =>
    api.post<Device>(`/sessions/${sessionId}/devices`, data),
  delete: (id: string) => api.delete(`/devices/${id}`),
  read: (id: string) => api.get<DataPoint>(`/devices/${id}/read`),
  startMonitor: (id: string, intervalMs: number) =>
    api.post<{ success: boolean }>(`/devices/${id}/monitor/start`, { intervalMs }),
  stopMonitor: (id: string) =>
    api.post<{ success: boolean }>(`/devices/${id}/monitor/stop`),
}

export const parsersApi = {
  list: () => api.get<Parser[]>('/parsers'),
  get: (id: string) => api.get<Parser>(`/parsers/${id}`),
  update: (id: string, data: Partial<Parser>) => api.put<Parser>(`/parsers/${id}`, data),
  delete: (id: string) => api.delete(`/parsers/${id}`),
  create: (data: Partial<Parser>) => api.post<Parser>('/parsers', data),
}

export const monitoringSessionsApi = {
  list: () => api.get<MonitoringSession[]>('/monitoring-sessions'),
  get: (id: string) => api.get<MonitoringSession>(`/monitoring-sessions/${id}`),
  getByDevice: (deviceId: string) => api.get<MonitoringSession[]>(`/devices/${deviceId}/monitoring-sessions`),
  create: (data: Partial<MonitoringSession>) => api.post<MonitoringSession>('/monitoring-sessions', data),
  update: (id: string, data: Partial<MonitoringSession>) => api.put<MonitoringSession>(`/monitoring-sessions/${id}`, data),
  delete: (id: string) => api.delete(`/monitoring-sessions/${id}`),
}

export const engineeringUnitsApi = {
  list: () => api.get<EngineeringUnit[]>('/engineering-units'),
  get: (id: string) => api.get<EngineeringUnit>(`/engineering-units/${id}`),
  create: (data: Partial<EngineeringUnit>) => api.post<EngineeringUnit>('/engineering-units', data),
  update: (id: string, data: Partial<EngineeringUnit>) => api.put<EngineeringUnit>(`/engineering-units/${id}`, data),
  delete: (id: string) => api.delete(`/engineering-units/${id}`),
}

export const annotationsApi = {
  listByMonitoringSession: (monitoringSessionId: string) =>
    api.get<Annotation[]>('/annotations', { params: { monitoring_session_id: monitoringSessionId } }),
  get: (id: string) => api.get<Annotation>(`/annotations/${id}`),
  create: (data: Partial<Annotation>) => api.post<Annotation>('/annotations', data),
  update: (id: string, data: Partial<Annotation>) => api.put<Annotation>(`/annotations/${id}`, data),
  delete: (id: string) => api.delete(`/annotations/${id}`),
}

export default api
