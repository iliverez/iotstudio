import { vi } from 'vitest'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebSocket } from '@/hooks/useWebSocket'

const mockWebSocket = vi.fn(() => ({
	send: vi.fn(),
	close: vi.fn(),
	readyState: 0,
	addEventListener: vi.fn(),
	removeEventListener: vi.fn(),
}))

// @ts-ignore
global.WebSocket = mockWebSocket

describe('useWebSocket', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('should create WebSocket connection', async () => {
		renderHook(() => useWebSocket('ws://localhost:8080/ws'))

		expect(mockWebSocket).toHaveBeenCalledWith('ws://localhost:8080/ws')
	})

	it('should send messages when connected', () => {
		const mockWS = {
			readyState: 1,
			send: vi.fn(),
			close: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		}
		mockWebSocket.mockReturnValue(mockWS)

		const { result } = renderHook(() => useWebSocket('ws://localhost:8080/ws'))

		act(() => {
			result.current.sendMessage({ type: 'test' })
		})

		expect(mockWS.send).toHaveBeenCalledWith(JSON.stringify({ type: 'test' }))
	})

	it('should disconnect on unmount', () => {
		const mockWS = {
			readyState: 1,
			send: vi.fn(),
			close: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		}
		mockWebSocket.mockReturnValue(mockWS)

		const { unmount } = renderHook(() => useWebSocket('ws://localhost:8080/ws'))

		unmount()

		expect(mockWS.close).toHaveBeenCalled()
	})
})
