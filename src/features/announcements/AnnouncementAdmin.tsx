import { useState } from 'react'
import { Megaphone } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { SettingsSection } from '@/features/settings/components/common'
import { useAuthStore } from '@/shared/store/authStore'
import { saveAnnouncement, type Announcement } from './service'
import { useAnnouncement } from './useAnnouncement'

function localDateTime(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function AnnouncementEditor({
  initial,
  ownerId,
  reload,
}: {
  initial: Announcement
  ownerId: string
  reload: () => void
}) {
  const [saved, setSaved] = useState(initial)
  const [title, setTitle] = useState(initial.title)
  const [content, setContent] = useState(initial.content)
  const [kind, setKind] = useState(initial.kind)
  const [versionLabel, setVersionLabel] = useState(initial.version_label || '')
  const [maintenanceStart, setMaintenanceStart] = useState(localDateTime(initial.maintenance_start))
  const [maintenanceEnd, setMaintenanceEnd] = useState(localDateTime(initial.maintenance_end))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function save(published: boolean, unpublish = false) {
    if (busy) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const result = await saveAnnouncement(ownerId, {
        ...saved,
        ...(!unpublish && {
          kind,
          version_label: kind === 'version_update' ? versionLabel : null,
          maintenance_start:
            kind === 'maintenance' && maintenanceStart
              ? new Date(maintenanceStart).toISOString()
              : null,
          maintenance_end:
            kind === 'maintenance' && maintenanceEnd
              ? new Date(maintenanceEnd).toISOString()
              : null,
        }),
        title: unpublish ? saved.title : title,
        content: unpublish ? saved.content : content,
        published,
      })
      setSaved(result)
      setMessage(
        published
          ? '公告已发布，用户下次刷新或一分钟内收到弹窗；播放中会延后展示。'
          : unpublish
            ? '公告已下架，未保存的编辑仍保留在表单中。'
            : '草稿已保存，用户暂时看不到。',
      )
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={event => {
        event.preventDefault()
        void save(true)
      }}
    >
      <p className="text-muted-foreground text-xs" role="status">
        {saved.published ? '已发布' : '未发布'} · 版本 {saved.revision}
      </p>
      <fieldset disabled={busy} className="space-y-4">
        <label className="block space-y-2 text-sm">
          <span>公告类型</span>
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={kind}
            onChange={event => setKind(event.target.value as Announcement['kind'])}
          >
            <option value="notice">普通公告</option>
            <option value="maintenance">维护通知</option>
            <option value="version_update">版本更新</option>
          </select>
        </label>
        {kind === 'version_update' && (
          <label className="block space-y-2 text-sm">
            <span>版本号（可选）</span>
            <Input
              value={versionLabel}
              maxLength={40}
              placeholder="例如：v2.1.0"
              onChange={event => setVersionLabel(event.target.value)}
            />
          </label>
        )}
        {kind === 'maintenance' && (
          <div className="space-y-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2 text-sm">
                <span>维护开始时间（可选）</span>
                <Input
                  type="datetime-local"
                  value={maintenanceStart}
                  onChange={event => setMaintenanceStart(event.target.value)}
                />
              </label>
              <label className="block space-y-2 text-sm">
                <span>预计结束时间（可选）</span>
                <Input
                  type="datetime-local"
                  value={maintenanceEnd}
                  min={maintenanceStart || undefined}
                  onChange={event => setMaintenanceEnd(event.target.value)}
                />
              </label>
            </div>
            <p className="text-muted-foreground text-xs">
              按当前设备时区填写。此时间仅供提醒，不会自动关闭网站或定时发布公告。
            </p>
          </div>
        )}
        <label className="block space-y-2 text-sm">
          <span>公告标题</span>
          <Input
            value={title}
            maxLength={100}
            placeholder="例如：本周维护通知"
            onChange={event => setTitle(event.target.value)}
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span>公告正文</span>
          <Textarea
            value={content}
            maxLength={10000}
            className="max-h-80 min-h-40 overflow-y-auto"
            placeholder="填写要通知用户的内容，支持换行。"
            onChange={event => setContent(event.target.value)}
          />
          <span className="text-muted-foreground block text-xs">{content.length} / 10000</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || !title.trim() || !content.trim()}>
            {busy ? '正在保存…' : saved.published ? '发布更新' : '发布公告'}
          </Button>
          {saved.published ? (
            <Button type="button" variant="outline" onClick={() => void save(false, true)}>
              下架公告
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => void save(false)}>
              保存草稿
            </Button>
          )}
        </div>
      </fieldset>
      {message && (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => {
          setTitle(saved.title)
          setContent(saved.content)
          setKind(saved.kind)
          setVersionLabel(saved.version_label || '')
          setMaintenanceStart(localDateTime(saved.maintenance_start))
          setMaintenanceEnd(localDateTime(saved.maintenance_end))
          setMessage('')
          setError('')
          reload()
        }}
      >
        重新加载（放弃未保存修改）
      </Button>
    </form>
  )
}

function AnnouncementManagement({ ownerId }: { ownerId: string }) {
  const { announcement, error, loading, reload } = useAnnouncement(false)
  return (
    <SettingsSection
      title="站内公告"
      description="选择公告类型并发布。新版本自动弹窗提醒，播放中延后展示；下架后停止展示。"
      icon={<Megaphone className="size-4" />}
      tone="amber"
    >
      {loading ? (
        <p className="text-muted-foreground text-sm">正在加载公告…</p>
      ) : error ? (
        <div className="space-y-3">
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
          <Button variant="outline" onClick={reload}>
            重试
          </Button>
        </div>
      ) : announcement ? (
        <AnnouncementEditor
          key={announcement.revision}
          initial={announcement}
          ownerId={ownerId}
          reload={reload}
        />
      ) : (
        <p className="text-muted-foreground text-sm">无法读取公告，请重新登录管理员账号。</p>
      )}
    </SettingsSection>
  )
}

export default function AnnouncementAdmin() {
  const account = useAuthStore(state => state.account)
  return account?.role === 'admin' ? (
    <AnnouncementManagement key={account.id} ownerId={account.id} />
  ) : null
}
