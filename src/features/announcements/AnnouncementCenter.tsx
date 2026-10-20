import { useEffect, useState } from 'react'
import { Megaphone } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog'
import { useAuthStore } from '@/shared/store/authStore'
import { dismissAnnouncement, dismissalKey, readDismissal } from './service'
import { useAnnouncement } from './useAnnouncement'
import { AnnouncementDetails } from './AnnouncementDetails'

function AccountAnnouncement({ ownerId, deferred }: { ownerId: string; deferred: boolean }) {
  const { announcement } = useAnnouncement()
  const [dismissed, setDismissed] = useState(() => readDismissal(ownerId))
  const [manualRevision, setManualRevision] = useState<number | null>(null)
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === dismissalKey(ownerId) || event.key === null)
        setDismissed(readDismissal(ownerId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [ownerId])
  if (!announcement?.published) return null
  const unread = dismissed !== String(announcement.revision)

  return (
    <Dialog
      key={announcement.revision}
      open={!deferred && (unread || manualRevision === announcement.revision)}
      onOpenChange={open => {
        if (open) setManualRevision(announcement.revision)
        else {
          dismissAnnouncement(ownerId, announcement.revision)
          setDismissed(String(announcement.revision))
          setManualRevision(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-7"
          aria-label="查看站内公告"
          title={deferred ? '退出播放页或关闭其他通知后查看公告' : '查看站内公告'}
          disabled={deferred}
        >
          <Megaphone className="size-4" />
          {unread && (
            <span
              aria-hidden="true"
              className="bg-primary absolute top-0.5 right-0.5 size-1.5 rounded-full"
            />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="top-1/2 right-auto bottom-auto left-1/2 max-h-[85dvh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border-b sm:bottom-auto sm:w-full">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug break-words">{announcement.title}</DialogTitle>
          <DialogDescription>
            站内公告 · {new Date(announcement.updated_at).toLocaleString()}
          </DialogDescription>
        </DialogHeader>
        <AnnouncementDetails announcement={announcement} />
        <DialogFooter>
          <DialogClose asChild>
            <Button>我知道了</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AnnouncementCenter({ deferred = false }: { deferred?: boolean }) {
  const ownerId = useAuthStore(state => state.account?.id)
  return ownerId ? (
    <AccountAnnouncement key={ownerId} ownerId={ownerId} deferred={deferred} />
  ) : null
}
