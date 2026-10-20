import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), result: vi.fn(), getState: vi.fn() }))
vi.mock('@/shared/sync/client', () => ({ syncClient: { rpc: mocks.rpc } }))
vi.mock('@/shared/store/authStore', () => ({ useAuthStore: { getState: mocks.getState } }))
import { saveAnnouncement, type Announcement } from './service'

const ownerId = '00000000-0000-4000-8000-000000000001'
const announcement: Announcement = {
  title: '维护通知',
  content: '公告正文',
  published: true,
  revision: 1,
  updated_at: '2026-10-20T08:00:00Z',
}
beforeEach(() => {
  mocks.rpc.mockReturnValue({ setHeader: mocks.result })
  mocks.getState.mockReturnValue({ account: { id: ownerId }, session: { access_token: 'jwt' } })
})

describe('公告 RPC 错误提示', () => {
  it('参数校验失败提示检查内容，不误报为网络故障', async () => {
    mocks.result.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Invalid announcement' },
    })
    await expect(saveAnnouncement(ownerId, announcement)).rejects.toThrow(
      '公告内容不符合要求，请检查标题与正文',
    )
  })

  it('网络故障仍提示检查网络并重试', async () => {
    mocks.result.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    await expect(saveAnnouncement(ownerId, announcement)).rejects.toThrow(
      '公告请求失败，请检查网络后重试',
    )
  })
})
