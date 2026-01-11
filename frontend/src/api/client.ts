import axios from 'axios'
import type { Session, Connection, Device, Parser } from '@/types'

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
  list: (sessionId: string) =>
    api.get<Connection[]>(`/sessions/${sessionId}/connections`),
  create: (sessionId: string, data: Partial<Connection>) =>
    api.post<Connection>(`/sessions/${sessionId}/connections`, data),
  delete: (id: string) => api.delete(`/connections/${id}`),
}

export const devicesApi = {
  list: (sessionId: string) => api.get<Device[]>(`/sessions/${sessionId}/devices`),
  listByConnection: (connectionId: string) =>
    api.get<Device[]>(`/connections/${connectionId}/devices`),
  create: (sessionId: string, data: Partial<Device>) =>
    api.post<Device>(`/sessions/${sessionId}/devices`, data),
  delete: (id: string) => api.delete(`/devices/${id}`),
}

export const parsersApi = {
  list: () => api.get<Parser[]>('/parsers'),
  get: (id: string) => api.get<Parser>(`/parsers/${id}`),
  create: (data: Partial<Parser>) => api.post<Parser>('/parsers', data),
  update: (id: string, data: Partial<Parser>) => api.put<Parser>(`/parsers/${id}`, data),
  delete: (id: string) => api.delete(`/parsers/${id}`),
}

export default api
