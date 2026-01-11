import { create } from 'zustand'
import type { Session, Device, ConnectionState, DataPoint } from '@/types'

interface DashboardStore {
  sessions: Session[]
  activeSessionId: string | null
  activeSession: Session | null
  metrics: Record<string, unknown>
  connections: ConnectionState[]
  dataPoints: Map<string, DataPoint[]>

  setSessions: (sessions: Session[]) => void
  setActiveSession: (id: string | null) => void
  addSession: (session: Session) => void
  updateSession: (id: string, updates: Partial<Session>) => void
  removeSession: (id: string) => void

  updateMetric: (key: string, value: unknown) => void
  updateMetricTransient: (key: string, value: unknown) => void

  setConnections: (connections: ConnectionState[]) => void
  updateConnection: (connectionId: string, updates: Partial<ConnectionState>) => void

  addDataPoint: (deviceId: string, point: DataPoint) => void
  getDataPoints: (deviceId: string) => DataPoint[]
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  activeSession: null,
  metrics: {},
  connections: [],
  dataPoints: new Map(),

  setSessions: (sessions) => set({ sessions }),

  setActiveSession: (id) =>
    set({
      activeSessionId: id,
      activeSession: id ? get().sessions.find((s) => s.id === id) || null : null,
    }),

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
    })),

  updateSession: (id, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s)),
      activeSession:
        state.activeSession?.id === id
          ? { ...state.activeSession, ...updates }
          : state.activeSession,
    })),

  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSession: state.activeSession?.id === id ? null : state.activeSession,
    })),

  updateMetric: (key, value) =>
    set((state) => ({
      metrics: { ...state.metrics, [key]: value },
    })),

  updateMetricTransient: (key, value) =>
    set((state) => {
      state.metrics[key] = value
      return {}
    }),

  setConnections: (connections) => set({ connections }),

  updateConnection: (connectionId, updates) =>
    set((state) => ({
      connections: state.connections.map((c) =>
        c.connectionId === connectionId ? { ...c, ...updates } : c
      ),
    })),

  addDataPoint: (deviceId, point) =>
    set((state) => {
      const dataPoints = state.dataPoints.get(deviceId) || []
      const maxPoints = 100
      const newPoints = [...dataPoints, point].slice(-maxPoints)
      const newDataPoints = new Map(state.dataPoints)
      newDataPoints.set(deviceId, newPoints)
      return { dataPoints: newDataPoints }
    }),

  getDataPoints: (deviceId) => get().dataPoints.get(deviceId) || [],
}))
