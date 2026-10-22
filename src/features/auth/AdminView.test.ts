import { act, createElement, Fragment } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/shared/store/authStore'
import { accountSchema } from '../../../shared/account-rules'
import AdminView from './AdminView'

const mocks = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('@/shared/sync/client', () => ({
  syncClient: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'test' } } }) },
  },
}))
vi.mock('@/features/announcements/service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/announcements/service')>()),
  readAnnouncement: mocks.read,
}))

const user = {
  id: '00000000-0000-4000-8000-000000000002',
  username: 'alice',
  role: 'user',
  enabled: true,
  created_at: '2026-10-01',
}
let host: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>

function Screen() {
  const location = useLocation()
  const navigate = useNavigate()
  return createElement(
    Fragment,
    null,
    createElement('output', null, location.pathname + location.search),
    createElement('button', { onClick: () => navigate(-1) }, '后退测试'),
    createElement('button', { onClick: () => navigate(1) }, '前进测试'),
    createElement(AdminView),
  )
}
const mount = (url = '/admin') =>
  act(async () =>
    root.render(createElement(MemoryRouter, { initialEntries: [url] }, createElement(Screen))),
  )
const button = (name: string) =>
  [...host.querySelectorAll('button,a')].find(
    node => node.textContent?.trim() === name,
  ) as HTMLButtonElement
const click = (name: string) => act(async () => button(name).click())
const selected = () =>
  host.querySelector('nav[aria-label="管理员功能"] [aria-pressed="true"]')?.textContent
const query = () => new URL(fetchMock.mock.lastCall![0], 'https://test.invalid').searchParams

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
      unobserve = vi.fn()
    },
  )
  useAuthStore.setState({ account: accountSchema.parse({ ...user, role: 'admin' }) })
  mocks.read.mockReset().mockResolvedValue({
    kind: 'notice',
    title: '现有标题',
    content: '',
    version_label: null,
    maintenance_start: null,
    maintenance_end: null,
    published: false,
    revision: 0,
    updated_at: '2026-10-22T08:00:00Z',
  })
  fetchMock = vi.fn(async (url: string) => {
    const params = new URL(url, 'https://test.invalid').searchParams
    const data = params.has('id')
      ? { account: { ...user, devices: [] }, total: 0 }
      : params.get('view') === 'audit'
        ? { audit: [], total: 41 }
        : { accounts: [user], total: 21 }
    return { ok: true, json: async () => data }
  })
  vi.stubGlobal('fetch', fetchMock)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('管理员中心标签导航', () => {
  it('站内公告排在第一位且默认打开，切换用户管理才加载账号', async () => {
    await mount()
    const labels = [...host.querySelectorAll('nav[aria-label="管理员功能"] button')].map(
      node => node.textContent,
    )
    expect(labels).toEqual(['站内公告', '用户管理', '操作记录'])
    expect(selected()).toBe('站内公告')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.read).toHaveBeenCalledTimes(1)
    await click('用户管理')
    expect(selected()).toBe('用户管理')
    expect(host.querySelector('output')?.textContent).toContain('tab=users')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(button('账号列表')).toBeUndefined()
    expect(
      [...host.querySelectorAll('button')].filter(node => node.textContent === '操作记录'),
    ).toHaveLength(1)
    await click('站内公告')
    expect(selected()).toBe('站内公告')
    expect(mocks.read).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('用户管理标签的链接刷新后仍打开用户管理，公告保持按需加载', async () => {
    await mount('/admin?tab=users')
    expect(selected()).toBe('用户管理')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('公告编辑在切换标签后保留，不会重新抓取或自动发布', async () => {
    await mount('/admin?tab=announcements')
    expect(fetchMock).not.toHaveBeenCalled()
    const title = host.querySelector<HTMLInputElement>('input[placeholder="例如：本周维护通知"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        title,
        '未保存的标题',
      )
      title.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click('用户管理')
    expect(title.closest('section[aria-label="站内公告"]')?.hasAttribute('hidden')).toBe(true)
    await click('站内公告')
    expect(
      host.querySelector<HTMLInputElement>('input[placeholder="例如：本周维护通知"]')?.value,
    ).toBe('未保存的标题')
    expect(mocks.read).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls.every(call => !call[1]?.body)).toBe(true)
  })

  it.each(['view=audit', 'tab=audit'])(
    '%s 打开实际操作记录，浏览器后退和前进恢复选中标签',
    async alias => {
      await mount(`/admin?${alias}&page=2`)
      expect(selected()).toBe('操作记录')
      expect(query().get('view')).toBe('audit')
      expect(query().get('offset')).toBe('20')
      await click('站内公告')
      await click('用户管理')
      await click('后退测试')
      expect(selected()).toBe('站内公告')
      await click('后退测试')
      expect(selected()).toBe('操作记录')
      await click('前进测试')
      expect(selected()).toBe('站内公告')
    },
  )

  it('切换模块保留账号筛选、重置分页，再次点击当前标签不重置分页', async () => {
    await mount('/admin?search=alice&enabled=false&nsfw=true&page=2')
    await click('用户管理')
    expect(query().get('offset')).toBe('20')
    await click('站内公告')
    await click('操作记录')
    expect(query().get('view')).toBe('audit')
    expect(query().has('search')).toBe(false)
    await click('用户管理')
    expect(query().get('offset')).toBe('0')
    expect(query().get('search')).toBe('alice')
    expect(query().get('enabled')).toBe('false')
    expect(query().get('nsfw')).toBe('true')
  })

  it('账号详情仍有返回列表入口，并恢复原分页', async () => {
    await mount('/admin?page=2&search=alice')
    await click('查看详情')
    expect(selected()).toBe('用户管理')
    expect(query().get('id')).toBe(user.id)
    expect(button('账号列表')).toBeDefined()
    await click('账号列表')
    expect(query().get('offset')).toBe('20')
    expect(query().get('search')).toBe('alice')
  })

  it('账号详情优先于 audit 别名，返回列表会清理别名并保留原分页', async () => {
    await mount(`/admin?tab=audit&id=${user.id}&listPage=2`)
    expect(selected()).toBe('用户管理')
    expect(query().get('id')).toBe(user.id)
    expect(query().has('view')).toBe(false)
    await click('账号列表')
    expect(selected()).toBe('用户管理')
    expect(query().get('offset')).toBe('20')
    expect(query().has('view')).toBe(false)
    expect(host.querySelector('output')?.textContent).toContain('tab=users')
  })

  it('未知标签回到站内公告，返回按钮可离开管理员中心', async () => {
    await mount('/admin?tab=unknown')
    expect(selected()).toBe('站内公告')
    await click('返回')
    expect(host.querySelector('output')?.textContent).toBe('/')
  })
})
