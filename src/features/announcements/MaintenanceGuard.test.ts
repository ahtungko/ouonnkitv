import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/shared/store/authStore'
import { accountSchema } from '../../../shared/account-rules'
import { MaintenanceGuard } from './MaintenanceGuard'
import { maintenanceIsActive, type MaintenanceStatus } from './maintenance'

const mocks = vi.hoisted(() => ({ read: vi.fn(), logout: vi.fn(), dispose: vi.fn() }))
vi.mock('./maintenance', async importOriginal => ({
  ...(await importOriginal<typeof import('./maintenance')>()),
  readMaintenance: mocks.read,
}))
const owner = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
const base = Date.parse('2026-10-20T08:00:00Z')
let host: HTMLDivElement
let root: Root
function login(id = owner, role = 'user') {
  useAuthStore.setState({
    account: accountSchema.parse({
      id,
      role,
      username: 'test',
      enabled: true,
      created_at: '2026-10-20',
    }),
    logout: mocks.logout,
  })
}
function status(start = 10_000, end = 20_000): MaintenanceStatus {
  return {
    server_time: new Date(base + performance.now()).toISOString(),
    maintenance: {
      title: '网站维护中',
      content: '升级服务，请稍后访问。',
      starts_at: new Date(base + start).toISOString(),
      ends_at: new Date(base + end).toISOString(),
    },
  }
}
function Player() {
  useEffect(() => () => mocks.dispose(), [])
  return createElement('div', { 'data-testid': 'app' }, '网站内容')
}
const mount = () =>
  act(async () => root.render(createElement(MaintenanceGuard, null, createElement(Player))))
const advance = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms))
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  })
  vi.setSystemTime(new Date('2040-01-01T00:00:00Z'))
  mocks.read.mockReset().mockImplementation(async () => status())
  mocks.logout.mockReset().mockResolvedValue(undefined)
  mocks.dispose.mockClear()
  login()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('定时维护访问控制', () => {
  it('按服务器时间准确进入和结束维护，设备时钟偏差不影响，开始时卸载播放器', async () => {
    await mount()
    expect(host.textContent).toContain('网站内容')
    await advance(9999)
    expect(host.textContent).toContain('网站内容')
    await advance(1)
    expect(host.textContent).toContain('网站维护中')
    expect(host.querySelector('[data-testid="app"]')).toBeNull()
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
    await advance(10_000)
    expect(host.textContent).toContain('网站内容')
    expect(mocks.logout).not.toHaveBeenCalled()
  })

  it('活跃维护不受公告已读记录影响，管理员始终豁免且不需等待状态请求', async () => {
    mocks.read.mockImplementation(async () => status(-10_000, 60_000))
    localStorage.setItem(`ouonnki-tv-announcement-dismissed:${owner}`, '100')
    await mount()
    expect(host.textContent).toContain('网站维护中')
    await act(async () => login(owner, 'admin'))
    expect(host.textContent).toContain('网站内容')
    mocks.read.mockClear()
    await act(async () => root.render(null))
    await mount()
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('管理员提前下架维护后，在下一次检查恢复访问', async () => {
    mocks.read.mockImplementation(async () => status(-10_000, 60_000))
    await mount()
    expect(host.textContent).toContain('网站维护中')
    mocks.read.mockImplementation(async () => ({
      server_time: new Date(base + performance.now()).toISOString(),
      maintenance: null,
    }))
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(host.textContent).toContain('网站内容')
  })

  it('检查失败时不放行，网络恢复后重试并恢复访问', async () => {
    mocks.read.mockRejectedValue(new Error('offline'))
    await mount()
    expect(host.textContent).toContain('暂时无法确认网站状态')
    expect(host.querySelector('[data-testid="app"]')).toBeNull()
    mocks.read.mockResolvedValue({ server_time: new Date(base).toISOString(), maintenance: null })
    await act(async () => window.dispatchEvent(new Event('online')))
    expect(host.textContent).toContain('网站内容')
  })

  it('旧账号的迟到响应不能控制新账号的访问', async () => {
    let finish!: (value: MaintenanceStatus) => void
    mocks.read.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        }),
    )
    await mount()
    await act(async () => login(other))
    expect(host.textContent).toContain('网站内容')
    await act(async () => finish(status(-10_000, 60_000)))
    expect(host.textContent).toContain('网站内容')
  })

  it('维护页可以切换账号以使用管理员身份登录', async () => {
    mocks.read.mockImplementation(async () => status(-10_000, 60_000))
    await mount()
    const button = Array.from(host.querySelectorAll('button')).find(item =>
      item.textContent?.includes('管理员登录'),
    )!
    await act(async () => button.click())
    expect(mocks.logout).toHaveBeenCalledTimes(1)
  })

  it('维护窗口采用开始包含、结束排除规则', () => {
    const value = status(10_000, 20_000)
    expect(maintenanceIsActive(value, base + 9999)).toBe(false)
    expect(maintenanceIsActive(value, base + 10_000)).toBe(true)
    expect(maintenanceIsActive(value, base + 20_000)).toBe(false)
  })
})
