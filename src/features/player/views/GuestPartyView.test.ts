// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

// @ts-expect-error React act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockNavigate = vi.fn()
vi.mock('react-router', () => ({
  useParams: () => ({ roomId: 'test-room-123' }),
  useNavigate: () => mockNavigate,
}))

const mockAuthStore = vi.hoisted(() => ({
  account: null as any,
}))

vi.mock('@/shared/store/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: any) => any) => selector(mockAuthStore)),
}))

const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn((callback?: (status: string) => void) => {
    if (callback) callback('SUBSCRIBED')
    return mockChannel
  }),
  unsubscribe: vi.fn(),
  send: vi.fn().mockResolvedValue(undefined),
  track: vi.fn().mockResolvedValue(undefined),
  presenceState: vi.fn().mockReturnValue({}),
}

const mockSyncClientObj = {
  channel: vi.fn().mockReturnValue(mockChannel),
  removeChannel: vi.fn(),
}

const mockSyncState = vi.hoisted(() => ({
  syncClient: null as any,
}))

vi.mock('@/shared/sync/client', () => ({
  get syncClient() {
    return mockSyncState.syncClient
  },
}))

import GuestPartyView from './GuestPartyView'

describe('GuestPartyView 访客退出安全守卫', () => {
  let host: HTMLDivElement
  let root: Root
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
    mockSyncState.syncClient = null
    mockAuthStore.account = null
    delete (window as any).location
    window.location = {
      ...originalLocation,
      href: 'http://localhost/party/test-room-123',
      pathname: '/party/test-room-123',
    } as any
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    ;(window as any).location = originalLocation
  })

  it('未登录访客点击退出影厅时，强制刷新跳转至登录页面而非 SPA 内部导航', async () => {
    await act(async () => {
      root.render(createElement(GuestPartyView))
    })

    const exitBtn = Array.from(host.querySelectorAll('button')).find(
      btn => btn.textContent?.includes('退出影厅'),
    )
    expect(exitBtn).toBeDefined()

    await act(async () => {
      exitBtn?.click()
    })

    // 访客退出不能走内部 navigate('/')，否则会暴露登录后的受保护主页
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(window.location.href).toBe('/')
  })

  it('放映结束屏上，未登录访客按钮显示为“返回登录页”且点击后跳转至根路径登录', async () => {
    await act(async () => {
      root.render(createElement(GuestPartyView))
    })

    // 因为 syncClient 为 null，组件会自动触发 terminateSession('站点未配置 Supabase 实时通道...')
    const curtainBtn = Array.from(host.querySelectorAll('button')).find(
      btn => btn.textContent?.includes('返回登录页'),
    )
    expect(curtainBtn).toBeDefined()

    await act(async () => {
      curtainBtn?.click()
    })

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(window.location.href).toBe('/')
  })

  it('已登录账号退出时，正常使用 SPA 内部路由 navigate(\'/\') 返回主站', async () => {
    mockAuthStore.account = { id: 'user-1', username: 'alice', role: 'user' }

    await act(async () => {
      root.render(createElement(GuestPartyView))
    })

    const curtainBtn = Array.from(host.querySelectorAll('button')).find(
      btn => btn.textContent?.includes('返回主站'),
    )
    expect(curtainBtn).toBeDefined()

    await act(async () => {
      curtainBtn?.click()
    })

    expect(mockNavigate).toHaveBeenCalledWith('/')
    expect(window.location.href).not.toBe('/')
  })

  it('当 URL 携带 inviter 参数时，显示邀请人欢迎信息并更新页面标题', async () => {
    window.location = {
      ...originalLocation,
      href: 'http://localhost/party/test-room-123?inviter=Nicholas',
      pathname: '/party/test-room-123',
      search: '?inviter=Nicholas',
    } as any

    await act(async () => {
      root.render(createElement(GuestPartyView))
    })

    expect(document.title).toContain('Nicholas')
    expect(document.title).toContain('xkaTV')
  })

  it('短链接的 i 参数显示邀请人', async () => {
    window.location = {
      ...originalLocation,
      href: 'http://localhost/p/test-room-123?i=Nicholas',
      pathname: '/p/test-room-123',
      search: '?i=Nicholas',
    } as any
    await act(async () => root.render(createElement(GuestPartyView)))
    expect(document.title).toContain('Nicholas')
  })

  it('当 URL 携带 poster 参数时，候播厅展示海报封面图片', async () => {
    mockSyncState.syncClient = mockSyncClientObj
    window.location = {
      ...originalLocation,
      href: 'http://localhost/party/test-room-123?inviter=Nicholas&poster=https%3A%2F%2Fexample.com%2Fposter.jpg',
      pathname: '/party/test-room-123',
      search: '?inviter=Nicholas&poster=https%3A%2F%2Fexample.com%2Fposter.jpg',
    } as any

    await act(async () => {
      root.render(createElement(GuestPartyView))
    })

    const posterImg = host.querySelector('img[src="https://example.com/poster.jpg"]')
    expect(posterImg).toBeDefined()
    expect(posterImg?.getAttribute('src')).toBe('https://example.com/poster.jpg')
  })

  it('候播时重复请求状态，并在收到带片源的心跳后显示播放器', async () => {
    vi.useFakeTimers()
    try {
      mockSyncState.syncClient = mockSyncClientObj
      await act(async () => root.render(createElement(GuestPartyView)))
      expect(mockChannel.send).toHaveBeenCalledTimes(1)
      await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
      expect(mockChannel.send).toHaveBeenCalledTimes(2)
      const broadcast = mockChannel.on.mock.calls.find(call => call[0] === 'broadcast')?.[2]
      expect(broadcast).toBeDefined()
      await act(async () => {
        broadcast({ payload: { type: 'heartbeat', senderId: 'host', time: 20, isPlaying: true, videoUrl: 'https://example.com/video.m3u8', mediaTitle: '电影' } })
      })
      expect(host.querySelector('#guest-player')).not.toBeNull()
      expect(host.textContent).toContain('电影')
      await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
      expect(mockChannel.send).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('短链接没有海报参数时仍能从房主状态获取海报', async () => {
    mockSyncState.syncClient = mockSyncClientObj
    await act(async () => root.render(createElement(GuestPartyView)))
    const broadcast = mockChannel.on.mock.calls.find(call => call[0] === 'broadcast')?.[2]
    await act(async () => {
      broadcast({ payload: { type: 'state_sync', senderId: 'host', time: 0, posterUrl: 'https://example.com/poster.jpg' } })
    })
    expect(host.querySelector('img[src="https://example.com/poster.jpg"]')).not.toBeNull()
  })

  it('打开房主已离开的旧链接，等待重连期后显示放映厅已结束', async () => {
    vi.useFakeTimers()
    try {
      mockSyncState.syncClient = mockSyncClientObj
      mockChannel.presenceState.mockReturnValue({})
      await act(async () => root.render(createElement(GuestPartyView)))
      const presence = mockChannel.on.mock.calls.find(call => call[0] === 'presence')?.[2]
      await act(async () => presence())
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
      expect(host.textContent).toContain('房主已离线超时')
    } finally { vi.useRealTimers() }
  })

  it('重连期内房主重新上线时，旧链接仍可继续进入', async () => {
    vi.useFakeTimers()
    try {
      mockSyncState.syncClient = mockSyncClientObj
      mockChannel.presenceState.mockReturnValue({})
      await act(async () => root.render(createElement(GuestPartyView)))
      const presence = mockChannel.on.mock.calls.find(call => call[0] === 'presence')?.[2]
      await act(async () => presence())
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
      mockChannel.presenceState.mockReturnValue({ host: [{ clientId: 'host', isHost: true }] })
      await act(async () => presence())
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
      expect(host.textContent).not.toContain('房主已离线超时')
    } finally { vi.useRealTimers() }
  })
})
