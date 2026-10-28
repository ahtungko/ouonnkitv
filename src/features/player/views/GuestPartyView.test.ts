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

vi.mock('@/shared/sync/client', () => ({
  syncClient: null,
}))

import GuestPartyView from './GuestPartyView'

describe('GuestPartyView 访客退出安全守卫', () => {
  let host: HTMLDivElement
  let root: Root
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
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
})
