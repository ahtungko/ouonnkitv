import { useEffect, useState } from 'react'
import { Megaphone, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog'
import { useAuthStore } from '@/shared/store/authStore'
import { dismissAnnouncement, dismissalKey, readDismissal } from './service'
import { useAnnouncement } from './useAnnouncement'

function AccountAnnouncement({ ownerId }: { ownerId: string }) {
  const { announcement } = useAnnouncement()
  const [dismissed, setDismissed] = useState(() => readDismissal(ownerId))
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === dismissalKey(ownerId) || event.key === null)
        setDismissed(readDismissal(ownerId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [ownerId])
  if (!announcement?.published) return null
  const collapsed = dismissed === String(announcement.revision)

  return (
    <Dialog key={announcement.revision}>
      <section
        aria-label="站内公告"
        className={
          collapsed
            ? 'flex justify-end'
            : 'border-border bg-card/80 flex items-start gap-3 rounded-xl border p-3 sm:p-4'
        }
      >
        {collapsed ? (
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <Megaphone className="size-4" />
              查看站内公告
            </Button>
          </DialogTrigger>
        ) : (
          <>
            <Megaphone className="text-primary mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground mb-1 text-xs">站内公告</p>
              <h2 className="text-sm font-semibold break-words">{announcement.title}</h2>
              <p className="text-muted-foreground mt-1 line-clamp-2 text-sm break-words whitespace-pre-wrap">
                {announcement.content}
              </p>
              <DialogTrigger asChild>
                <Button variant="link" size="sm" className="mt-1 h-auto p-0">
                  查看全文
                </Button>
              </DialogTrigger>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label="关闭本版公告"
              onClick={() => {
                dismissAnnouncement(ownerId, announcement.revision)
                setDismissed(String(announcement.revision))
              }}
            >
              <X className="size-4" />
            </Button>
          </>
        )}
      </section>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:bottom-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug break-words">{announcement.title}</DialogTitle>
          <DialogDescription>
            站内公告 · {new Date(announcement.updated_at).toLocaleString()}
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm leading-relaxed break-words whitespace-pre-wrap">
          {announcement.content}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function AnnouncementBanner() {
  const ownerId = useAuthStore(state => state.account?.id)
  return ownerId ? <AccountAnnouncement key={ownerId} ownerId={ownerId} /> : null
}
