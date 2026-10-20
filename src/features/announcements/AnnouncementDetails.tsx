import { Megaphone, Sparkles, Wrench } from 'lucide-react'
import type { Announcement } from './service'

const styles = {
  notice: {
    label: '普通公告',
    icon: Megaphone,
    color: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  maintenance: {
    label: '维护通知',
    icon: Wrench,
    color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  version_update: {
    label: '版本更新',
    icon: Sparkles,
    color: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
}

export function AnnouncementDetails({ announcement }: { announcement: Announcement }) {
  const { label, icon: Icon, color } = styles[announcement.kind]
  const formatTime = (time: string) => new Date(time).toLocaleString()
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${color}`}
        >
          <Icon className="size-3.5" />
          {label}
        </span>
        {announcement.kind === 'version_update' && announcement.version_label && (
          <span className="bg-muted max-w-full rounded-full px-3 py-1 text-xs font-medium break-words">
            {announcement.version_label}
          </span>
        )}
      </div>
      {announcement.kind === 'maintenance' &&
        (announcement.maintenance_start || announcement.maintenance_end) && (
          <div className="space-y-1 rounded-lg bg-amber-500/10 p-3 text-sm">
            {announcement.maintenance_start && (
              <p>开始时间：{formatTime(announcement.maintenance_start)}</p>
            )}
            {announcement.maintenance_end && (
              <p>预计结束：{formatTime(announcement.maintenance_end)}</p>
            )}
            <p className="text-muted-foreground text-xs">时间按当前设备时区显示</p>
          </div>
        )}
      <div className="text-sm leading-relaxed break-words whitespace-pre-wrap">
        {announcement.content}
      </div>
    </div>
  )
}
