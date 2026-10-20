import { z } from 'zod'
import { syncClient } from '@/shared/sync/client'
import { useAuthStore } from '@/shared/store/authStore'

const timestamp = z.string().datetime({ offset: true })
const statusSchema = z.object({
  server_time: timestamp,
  maintenance: z
    .object({
      title: z.string().max(100),
      content: z.string().max(10000),
      starts_at: timestamp,
      ends_at: timestamp,
    })
    .nullable(),
})
export type MaintenanceStatus = z.infer<typeof statusSchema>

export function maintenanceIsActive(status: MaintenanceStatus, serverNow: number) {
  const window = status.maintenance
  return (
    !!window && Date.parse(window.starts_at) <= serverNow && serverNow < Date.parse(window.ends_at)
  )
}

export async function readMaintenance(
  ownerId: string,
  signal: AbortSignal,
): Promise<MaintenanceStatus> {
  const { account, session } = useAuthStore.getState()
  if (!syncClient || account?.id !== ownerId || session?.user.id !== ownerId)
    throw new Error('账号已变化，请重新登录')
  const { data, error } = await syncClient
    .rpc('get_site_maintenance_status')
    .setHeader('Authorization', `Bearer ${session.access_token}`)
    .abortSignal(signal)
  if (error) throw new Error('暂时无法确认网站状态，请重试或联系管理员')
  return statusSchema.parse(data)
}
