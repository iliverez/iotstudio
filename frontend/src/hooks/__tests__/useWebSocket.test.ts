import { vi } from 'vitest'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWebSocket } from '@/useWebSocket'

const mockWebSocket = vi.fn(() => ({
	send: vi.fn(),
	close: vi.fn(),
	readyState: WebSocket.CONNECTING,
	addEventListener: vi.fn(),
	removeEventListener: vi.fn(),
}))

global.WebSocket = mockWebSocket as any

describe('useWebSocket', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('should create WebSocket connection', async () => {
		const { result } = renderHook(() => useWebSocket('ws://localhost:8080/ws'))

		expect(mockWebSocket).toHaveBeenCalledWith('ws://localhost:8080/ws')
	})

	it('should send messages when connected', () => {
		const mockWS = {
			readyState: WebSocket.OPEN,
			send: vi.fn(),
			close: vi.fn(),
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
			readyState: WebSocket.OPEN,
			send: vi.fn(),
			close: vi.fn(),
		}
		mockWebSocket.mockReturnValue(mockWS)

		const { unmount } = renderHook(() => useWebSocket('ws://localhost:8080/ws'))

		unmount()

		expect(mockWS.close).toHaveBeenCalled()
	})
})
