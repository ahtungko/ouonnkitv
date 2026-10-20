import { useEffect, useState, type ReactNode } from 'react'
import { Wrench } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { OkiLogo } from '@/shared/components/icons'
import { useAuthStore } from '@/shared/store/authStore'
import { maintenanceIsActive, readMaintenance, type MaintenanceStatus } from './maintenance'

function UserMaintenanceGuard({ ownerId, children }: { ownerId: string; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<{
    status: MaintenanceStatus
    receivedAt: number
  } | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [, tick] = useState(0)

  useEffect(() => {
    let stopped = false
    let pending = false
    let request: AbortController | undefined
    const load = async () => {
      if (pending || stopped) return
      pending = true
      request = new AbortController()
      const timeout = window.setTimeout(() => request?.abort(), 8000)
      try {
        const status = await readMaintenance(ownerId, request.signal)
        if (!stopped) {
          setSnapshot({ status, receivedAt: performance.now() })
          setError('')
        }
      } catch {
        if (!stopped) setError('暂时无法确认网站状态，请重试或联系管理员')
      } finally {
        pending = false
        window.clearTimeout(timeout)
      }
    }
    const visible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    void load()
    const interval = window.setInterval(visible, 15_000)
    window.addEventListener('focus', visible)
    window.addEventListener('online', visible)
    document.addEventListener('visibilitychange', visible)
    return () => {
      stopped = true
      request?.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', visible)
      window.removeEventListener('online', visible)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [ownerId, refresh])

  useEffect(() => {
    const window = snapshot?.status.maintenance
    if (!snapshot || !window) return
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const now = Date.parse(snapshot.status.server_time) + performance.now() - snapshot.receivedAt
      const next = [Date.parse(window.starts_at), Date.parse(window.ends_at)].find(
        time => time > now,
      )
      if (next === undefined) return
      timer = setTimeout(
        () => {
          tick(value => value + 1)
          schedule()
        },
        Math.max(1, Math.min(next - now, 2_147_483_647)),
      )
    }
    schedule()
    return () => clearTimeout(timer)
  }, [snapshot])

  const serverNow = snapshot
    ? Date.parse(snapshot.status.server_time) + performance.now() - snapshot.receivedAt
    : 0
  const active = snapshot && maintenanceIsActive(snapshot.status, serverNow)
  if (snapshot && !error && !active) return <>{children}</>
  const maintenance = active ? snapshot.status.maintenance : null

  return (
    <div className="bg-background flex min-h-dvh items-center justify-center px-6 py-12">
      <main
        className="w-full max-w-lg space-y-5 rounded-2xl border p-6 sm:p-8"
        aria-label="网站维护状态"
      >
        <OkiLogo size={48} />
        <Wrench className="size-8 text-amber-500" />
        <h1 className="text-2xl font-semibold break-words">
          {maintenance ? maintenance.title : error ? '暂时无法连接网站' : '正在检查网站状态…'}
        </h1>
        {maintenance && (
          <>
            <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
              {maintenance.content}
            </p>
            <div className="bg-muted space-y-1 rounded-lg p-3 text-sm">
              <p>开始时间：{new Date(maintenance.starts_at).toLocaleString()}</p>
              <p>结束时间：{new Date(maintenance.ends_at).toLocaleString()}</p>
              <p className="text-muted-foreground text-xs">时间按当前设备时区显示</p>
            </div>
            <p className="text-muted-foreground text-sm">维护结束后自动恢复访问，无需重新登录。</p>
          </>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setRefresh(value => value + 1)}>
            重新检查
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              setLogoutError('')
              void useAuthStore
                .getState()
                .logout()
                .catch(() => setLogoutError('退出失败，请稍后重试'))
                .finally(() => setBusy(false))
            }}
          >
            切换账号 / 管理员登录
          </Button>
        </div>
        {logoutError && (
          <p role="alert" className="text-destructive text-sm">
            {logoutError}
          </p>
        )}
      </main>
    </div>
  )
}

export function MaintenanceGuard({ children }: { children: ReactNode }) {
  const account = useAuthStore(state => state.account)
  if (!account) return null
  if (account.role === 'admin') return <>{children}</>
  return (
    <UserMaintenanceGuard key={account.id} ownerId={account.id}>
      {children}
    </UserMaintenanceGuard>
  )
}
