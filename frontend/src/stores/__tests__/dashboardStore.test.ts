import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDashboardStore } from '@/stores/dashboardStore'
import type { Session } from '@/types'

describe('DashboardStore', () => {
	beforeEach(() => {
		useDashboardStore.setState({
			sessions: [],
			activeSessionId: null,
			activeSession: null,
			metrics: {},
			connections: [],
			dataPoints: new Map(),
		})
	})

	it('should add a session', () => {
		const { result } = renderHook(() => useDashboardStore())
		const session: Session = {
			id: 'session-1',
			name: 'Test Session',
			status: 'idle',
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		}

		act(() => {
			result.current.addSession(session)
		})

		expect(result.current.sessions).toHaveLength(1)
		expect(result.current.sessions[0]).toEqual(session)
	})

	it('should set active session', () => {
		const { result } = renderHook(() => useDashboardStore())
		const session: Session = {
			id: 'session-1',
			name: 'Test Session',
			status: 'idle',
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		}

		act(() => {
			result.current.setSessions([session])
			result.current.setActiveSession('session-1')
		})

		expect(result.current.activeSessionId).toBe('session-1')
		expect(result.current.activeSession).toEqual(session)
	})

	it('should update metric', () => {
		const { result } = renderHook(() => useDashboardStore())

		act(() => {
			result.current.updateMetric('test_key', 'test_value')
		})

		expect(result.current.metrics.test_key).toBe('test_value')
	})

	it('should update metric transiently', () => {
		const { result } = renderHook(() => useDashboardStore())

		act(() => {
			result.current.updateMetricTransient('test_key', 'test_value')
		})

		expect(result.current.metrics.test_key).toBe('test_value')
	})

	it('should add data point', () => {
		const { result } = renderHook(() => useDashboardStore())
		const dataPoint = {
			sessionId: 'session-1',
			deviceId: 'device-1',
			timestamp: 1704067200000,
			data: { value: 42 },
		}

		act(() => {
			result.current.addDataPoint('device-1', dataPoint)
		})

		const points = result.current.getDataPoints('device-1')
		expect(points).toHaveLength(1)
		expect(points[0]).toEqual(dataPoint)
	})

	it('should limit data points to 100', () => {
		const { result } = renderHook(() => useDashboardStore())

		for (let i = 0; i < 150; i++) {
			act(() => {
				result.current.addDataPoint('device-1', {
					sessionId: 'session-1',
					deviceId: 'device-1',
					timestamp: 1704067200000 + i * 1000,
					data: { value: i },
				})
			})
		}

		const points = result.current.getDataPoints('device-1')
		expect(points).toHaveLength(100)
	})

	it('should remove session', () => {
		const { result } = renderHook(() => useDashboardStore())
		const session: Session = {
			id: 'session-1',
			name: 'Test Session',
			status: 'idle',
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		}

		act(() => {
			result.current.addSession(session)
		})

		expect(result.current.sessions).toHaveLength(1)

		act(() => {
			result.current.removeSession('session-1')
		})

		expect(result.current.sessions).toHaveLength(0)
	})
})
