import { z } from 'zod'
import { syncClient } from '@/shared/sync/client'
import { useAuthStore } from '@/shared/store/authStore'

const announcementSchema = z.object({
  title: z.string().max(100),
  content: z.string().max(10000),
  published: z.boolean(),
  revision: z.number().int().nonnegative(),
  updated_at: z.string(),
})

export type Announcement = z.infer<typeof announcementSchema>

function credentials(ownerId: string) {
  const { account, session } = useAuthStore.getState()
  if (!syncClient) throw new Error('请先配置 Supabase')
  if (account?.id !== ownerId || !session) throw new Error('账号已变化，请重新打开公告')
  return { client: syncClient, token: session.access_token }
}

function announcementError(error: { code?: string; message: string }) {
  if (['PGRST202', '42P01', '42883'].includes(error.code || ''))
    return new Error('请先在 Supabase 执行公告迁移 202610200001_site_announcement.sql')
  if (error.message.includes('Announcement changed'))
    return new Error('公告已在其他页面更新。请重新加载后再编辑，本次修改尚未保存。')
  if (error.message.includes('Invalid announcement'))
    return new Error('公告内容不符合要求，请检查标题与正文')
  if (error.code === '42501' || /Inactive account|Admin required/.test(error.message))
    return new Error('账号已失效或没有公告管理权限，请重新登录')
  return new Error('公告请求失败，请检查网络后重试')
}

export async function readAnnouncement(ownerId: string, signal: AbortSignal) {
  const { client, token } = credentials(ownerId)
  const { data, error } = await client
    .rpc('get_site_announcement')
    .setHeader('Authorization', `Bearer ${token}`)
    .abortSignal(signal)
  if (error) throw announcementError(error)
  return data === null ? null : announcementSchema.parse(data)
}

export async function saveAnnouncement(ownerId: string, value: Announcement) {
  const { client, token } = credentials(ownerId)
  const parsed = announcementSchema.parse({
    ...value,
    title: value.title.trim(),
    content: value.content.trim(),
  })
  if (parsed.published && (!parsed.title || !parsed.content))
    throw new Error('请填写公告标题和正文')
  const { data, error } = await client
    .rpc('save_site_announcement', {
      p_title: parsed.title,
      p_content: parsed.content,
      p_published: parsed.published,
      p_expected_revision: parsed.revision,
    })
    .setHeader('Authorization', `Bearer ${token}`)
  if (error) throw announcementError(error)
  credentials(ownerId)
  return announcementSchema.parse(data)
}

export const dismissalKey = (ownerId: string) => `ouonnki-tv-announcement-dismissed:${ownerId}`

export function readDismissal(ownerId: string) {
  try {
    return localStorage.getItem(dismissalKey(ownerId))
  } catch {
    return null
  }
}

export function dismissAnnouncement(ownerId: string, revision: number) {
  try {
    localStorage.setItem(dismissalKey(ownerId), String(revision))
  } catch {
    // The banner can still be dismissed for this page when storage is unavailable.
  }
}
