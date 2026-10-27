import { useState } from 'react'
import {
  Users,
  Crown,
  Copy,
  Check,
  LogOut,
  Radio,
  ShieldCheck,
  Sparkles,
  AlertCircle,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Input } from '@/shared/components/ui/input'
import type { WatchPartyMode, WatchPartyParticipant } from '../hooks/useWatchParty'

interface WatchPartyModalProps {
  isOpen: boolean
  onClose: () => void
  isPartyActive: boolean
  isHost: boolean
  mode: WatchPartyMode
  roomId: string | null
  participants: WatchPartyParticipant[]
  isSupabaseAvailable: boolean
  onCreateParty: (mode: WatchPartyMode) => string
  onLeaveParty: () => void
}

export function WatchPartyModal({
  isOpen,
  onClose,
  isPartyActive,
  isHost,
  mode,
  roomId,
  participants,
  isSupabaseAvailable,
  onCreateParty,
  onLeaveParty,
}: WatchPartyModalProps) {
  const [selectedMode, setSelectedMode] = useState<WatchPartyMode>('host_only')
  const [copied, setCopied] = useState(false)

  const inviteUrl = typeof window !== 'undefined' ? window.location.href : ''

  const handleCreate = () => {
    onCreateParty(selectedMode)
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      setCopied(false)
    }
  }

  const handleLeave = () => {
    onLeaveParty()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Users className="size-5 text-red-500" />
            一起看 · 同步放映室
          </DialogTitle>
          <DialogDescription>
            异地好友双人/多人同步看剧。播放、暂停、换集与快进毫秒级同屏联动。
          </DialogDescription>
        </DialogHeader>

        {!isSupabaseAvailable ? (
          <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3.5 text-xs text-yellow-600 dark:text-yellow-400">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">尚未配置 Supabase</p>
              <p className="mt-1 opacity-90">
                「一起看」依赖 Supabase 实时 WebSocket 广播通道。请在部署后台配置{' '}
                <code className="rounded bg-black/10 px-1 dark:bg-white/10">OKI_SUPABASE_URL</code> 和{' '}
                <code className="rounded bg-black/10 px-1 dark:bg-white/10">
                  OKI_SUPABASE_ANON_KEY
                </code>{' '}
                环境变量后即可开启。
              </p>
            </div>
          </div>
        ) : !isPartyActive ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">选择控制权限模式</label>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSelectedMode('host_only')}
                  className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                    selectedMode === 'host_only'
                      ? 'border-red-500/80 bg-red-500/10 text-foreground ring-1 ring-red-500/50'
                      : 'border-border/60 hover:border-border hover:bg-accent/40 text-muted-foreground'
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <Crown className="size-4 text-amber-500" />
                      房主主控
                    </span>
                    {selectedMode === 'host_only' && (
                      <span className="size-2 rounded-full bg-red-500" />
                    )}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed opacity-80">
                    仅创建者有权暂停/快进/换集，观众锁定进度条跟随，适合群放映或多人聚会。
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedMode('collaborative')}
                  className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                    selectedMode === 'collaborative'
                      ? 'border-red-500/80 bg-red-500/10 text-foreground ring-1 ring-red-500/50'
                      : 'border-border/60 hover:border-border hover:bg-accent/40 text-muted-foreground'
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <Radio className="size-4 text-emerald-500" />
                      全员自由
                    </span>
                    {selectedMode === 'collaborative' && (
                      <span className="size-2 rounded-full bg-red-500" />
                    )}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed opacity-80">
                    房间内所有人均可自由暂停和调整进度，适合情侣两人、密友双人观影。
                  </p>
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/40 p-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 text-foreground font-medium">
                <Sparkles className="size-3.5 text-red-500" />
                <span>极速连接，零视频带宽消耗</span>
              </div>
              <p className="mt-1 leading-relaxed">
                仅同步播放器时间戳与状态信号，视频流由双方设备直连播放，不消耗服务器中转流量。
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Room status card */}
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-sm font-semibold text-foreground">放映室已就绪</span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    ID: {roomId}
                  </Badge>
                </div>
                <Badge
                  variant="secondary"
                  className="flex items-center gap-1 text-[11px] font-normal"
                >
                  {mode === 'host_only' ? (
                    <>
                      <Crown className="size-3 text-amber-500" />
                      房主主控
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="size-3 text-emerald-500" />
                      全员自由
                    </>
                  )}
                </Badge>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>当前身份:</span>
                <span className="font-medium text-foreground">
                  {isHost ? '👑 你是房主' : '🤝 你是观众'}
                </span>
                {mode === 'host_only' && !isHost && (
                  <span className="text-amber-500/90">(播放进度由房主统一控制)</span>
                )}
              </div>
            </div>

            {/* Participants */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>在线成员 ({Math.max(participants.length, 1)} 人)</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto rounded-lg border border-border/40 p-2 bg-background/50">
                {participants.length === 0 ? (
                  <span className="text-xs text-muted-foreground">等待好友加入...</span>
                ) : (
                  participants.map(p => (
                    <Badge
                      key={p.id}
                      variant="outline"
                      className="flex items-center gap-1 py-1 text-xs"
                    >
                      {p.isHost && <Crown className="size-3 text-amber-500" />}
                      <span className="truncate max-w-[120px]">{p.name}</span>
                    </Badge>
                  ))
                )}
              </div>
            </div>

            {/* Share invite link */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">邀请链接</label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={inviteUrl}
                  className="text-xs font-mono h-9 bg-muted/40 selection:bg-red-500/20"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 shrink-0 gap-1.5 px-3"
                  onClick={handleCopyLink}
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5 text-emerald-500" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      复制链接
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                将链接发送给好友，对方在浏览器打开即可自动同步观看当前剧集。
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:gap-0">
          {isPartyActive ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={handleLeave}
            >
              <LogOut className="size-3.5" />
              退出放映室
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {!isPartyActive && isSupabaseAvailable && (
              <Button
                type="button"
                className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
                size="sm"
                onClick={handleCreate}
              >
                <Users className="size-3.5" />
                创建放映室
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {isPartyActive ? '保持并关闭窗口' : '取消'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
