// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

// @ts-expect-error React act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const callbacks: Record<string, (...args: any[]) => void> = {}
  const player = {
    currentTime: 0,
    video: { paused: true },
    notice: { show: '' },
    on: vi.fn((event: string, callback: (...args: any[]) => void) => { callbacks[event] = callback }),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    destroy: vi.fn(),
  }
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((callback: (status: string) => void) => { callback('SUBSCRIBED'); return channel }),
    send: vi.fn().mockResolvedValue(undefined), track: vi.fn(), unsubscribe: vi.fn(), presenceState: vi.fn().mockReturnValue({}),
  }
  const playerOptions: any[] = []
  const hlsOptions: any[] = []
  return { callbacks, player, channel, playerOptions, hlsOptions }
})

vi.mock('artplayer', () => ({ default: class { constructor(options: unknown) { mocks.playerOptions.push(options); return mocks.player } } }))
vi.mock('hls.js/dist/hls.light.mjs', () => ({ default: class {
  static isSupported() { return true }
  static DefaultConfig = { loader: class {} }
  constructor(options: unknown) { mocks.hlsOptions.push(options) }
  loadSource() {}
  attachMedia() {}
  destroy() {}
} }))
vi.mock('react-router', () => ({ useParams: () => ({ roomId: 'room' }), useNavigate: () => vi.fn() }))
vi.mock('@/shared/store/authStore', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ account: null }) }))
vi.mock('@/shared/sync/client', () => ({ syncClient: { channel: () => mocks.channel, removeChannel: vi.fn(), rpc: vi.fn().mockResolvedValue({ data: 'open', error: null }) } }))

import GuestPartyView from './GuestPartyView'

describe('访客播放器进度同步', () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  afterEach(async () => { await act(async () => root.unmount()); host.remove() })

  it('准备期间保留最新进度，准备完成后继续校正漂移', async () => {
    await act(async () => root.render(createElement(GuestPartyView)))
    const broadcast = mocks.channel.on.mock.calls.find(call => call[0] === 'broadcast')?.[2]
    expect(broadcast).toBeDefined()
    await act(async () => {
      broadcast({ payload: { type: 'state_sync', senderId: 'host', videoUrl: 'https://example.com/video.m3u8', time: 10, isPlaying: true, adFilteringEnabled: true } })
    })
    await vi.waitFor(() => expect(mocks.callbacks.ready).toBeDefined())
    mocks.playerOptions.at(-1).customType.m3u8({}, 'https://example.com/video.m3u8', mocks.player)
    expect(mocks.hlsOptions.at(-1).loader).toBeTypeOf('function')
    await act(async () => {
      broadcast({ payload: { type: 'heartbeat', senderId: 'host', time: 12, isPlaying: true } })
      mocks.callbacks.ready()
    })
    expect(mocks.player.currentTime).toBe(12)
    expect(mocks.player.play).toHaveBeenCalled()
    await act(async () => {
      broadcast({ payload: { type: 'heartbeat', senderId: 'host', time: 13.2, isPlaying: true } })
    })
    expect(mocks.player.currentTime).toBe(13.2)
    mocks.player.play.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'))
    await act(async () => {
      broadcast({ payload: { type: 'play', senderId: 'host', time: 20 } })
    })
    const resume = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('点击播放并同步'))
    expect(resume).toBeDefined()
    await act(async () => { resume?.click() })
    expect(mocks.player.currentTime).toBeGreaterThanOrEqual(20)
    const initialInstances = mocks.playerOptions.length
    await act(async () => {
      broadcast({ payload: { type: 'heartbeat', senderId: 'host', time: 21, isPlaying: true, adFilteringEnabled: false } })
    })
    await vi.waitFor(() => expect(mocks.playerOptions.length).toBeGreaterThan(initialInstances))
    mocks.playerOptions.at(-1).customType.m3u8({}, 'https://example.com/video.m3u8', mocks.player)
    expect(mocks.hlsOptions.at(-1).loader).toBeUndefined()
  })
})
