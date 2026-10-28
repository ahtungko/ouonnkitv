import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import {
  Film,
  Popcorn,
  Users,
  Crown,
  Sparkles,
  WifiOff,
  LogOut,
  AlertTriangle,
} from 'lucide-react'
import Artplayer from 'artplayer'
import { syncClient } from '@/shared/sync/client'
import { useAuthStore } from '@/shared/store/authStore'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import type {
  WatchPartyAction,
  WatchPartyParticipant,
} from '../hooks/useWatchParty'

function getInviterName(): string {
  if (typeof window === 'undefined') return ''
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get('inviter') || params.get('partyInviter') || ''
  } catch {
    return ''
  }
}

function getPosterFromUrl(): string {
  if (typeof window === 'undefined') return ''
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get('poster') || ''
  } catch {
    return ''
  }
}

export default function GuestPartyView() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const account = useAuthStore(state => state.account)
  const [inviter] = useState<string>(() => getInviterName())
  const [posterUrl, setPosterUrl] = useState<string>(() => getPosterFromUrl())

  const [participants, setParticipants] = useState<WatchPartyParticipant[]>([])
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [mediaTitle, setMediaTitle] = useState<string>('')
  const [episodeTitle, setEpisodeTitle] = useState<string>('')
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [hostOnline, setHostOnline] = useState<boolean>(false)
  const [hostEverConnected, setHostEverConnected] = useState<boolean>(false)
  const [disconnectCountdown, setDisconnectCountdown] = useState<number | null>(null)
  const [terminatedReason, setTerminatedReason] = useState<string | null>(null)

  // Dynamic document title with inviter and media title
  useEffect(() => {
    const site = 'xkaTV'
    if (mediaTitle) {
      document.title = inviter
        ? `[${inviter} 邀请你一起看] 《${mediaTitle}》 - ${site}`
        : `《${mediaTitle}》 - 私享放映厅 - ${site}`
    } else {
      document.title = inviter
        ? `[${inviter} 的专属放映厅] - ${site}`
        : `私享放映厅 - ${site}`
    }
  }, [mediaTitle, inviter])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const artRef = useRef<Artplayer | null>(null)
  const videoUrlRef = useRef<string | null>(null)
  const pendingPlaybackRef = useRef<{ time: number; isPlaying?: boolean } | null>(null)
  const terminatedRef = useRef(false)
  const isRemoteRef = useRef(false)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const myClientIdRef = useRef<string>(`guest_${Math.random().toString(36).substring(2, 8)}`)

  // Prevent right-click context menu and inspection shortcuts for cleaner cinema feel
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase()))
      ) {
        e.preventDefault()
      }
    }
    window.addEventListener('contextmenu', handleContextMenu)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Terminate function: immediately stops & destroys player
  const terminateSession = useCallback((reason: string) => {
    terminatedRef.current = true
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    if (artRef.current) {
      try {
        artRef.current.destroy(true)
      } catch {
        // ignore
      }
      artRef.current = null
    }
    setVideoUrl(null)
    videoUrlRef.current = null
    pendingPlaybackRef.current = null
    setDisconnectCountdown(null)
    setTerminatedReason(reason)
  }, [])

  // Connect to Supabase Realtime channel
  useEffect(() => {
    if (!roomId) {
      setTerminatedReason('未提供有效的放映厅房间号')
      return
    }

    if (!syncClient) {
      setTerminatedReason('站点未配置 Supabase 实时通道，无法连接放映厅')
      return
    }

    const channelName = `watch_party_${roomId}`
    const channel = syncClient.channel(channelName, {
      config: {
        broadcast: { self: false },
        presence: { key: myClientIdRef.current },
      },
    })
    let subscribed = false
    const requestState = () => {
      if (!subscribed || videoUrlRef.current || terminatedRef.current) return
      void channel.send({
        type: 'broadcast',
        event: 'party_action',
        payload: {
          type: 'request_state',
          senderId: myClientIdRef.current,
          senderName: `访客_${myClientIdRef.current.substring(6)}`,
        },
      })
    }
    const retryState = window.setInterval(requestState, 5000)

    // Listen to broadcast actions
    channel.on('broadcast', { event: 'party_action' }, ({ payload }) => {
      const action = payload as WatchPartyAction
      if (!action || action.senderId === myClientIdRef.current || terminatedRef.current) return

      const player = artRef.current

      switch (action.type) {
        case 'state_sync':
        case 'heartbeat': {
          if (action.mediaTitle) setMediaTitle(action.mediaTitle)
          if (action.episodeTitle) setEpisodeTitle(action.episodeTitle)
          if (action.posterUrl) setPosterUrl(action.posterUrl)
          const sourceChanged = Boolean(action.videoUrl && action.videoUrl !== videoUrlRef.current)
          if (action.videoUrl) {
            videoUrlRef.current = action.videoUrl
            setVideoUrl(action.videoUrl)
          }

          setIsPlaying(Boolean(action.isPlaying))

          if (sourceChanged || !player) {
            pendingPlaybackRef.current = { time: action.time || 0, isPlaying: action.isPlaying }
          } else if (player) {
            isRemoteRef.current = true
            if (action.type === 'state_sync' || Math.abs((player.currentTime || 0) - action.time) > 2.5) {
              player.currentTime = action.time || 0
            }
            if (action.isPlaying) {
              if (player.video.paused) void player.play().catch(() => {})
            } else if (!player.video.paused) {
              player.pause()
            }
            setTimeout(() => {
              isRemoteRef.current = false
            }, 600)
          }
          break
        }
        case 'play': {
          setIsPlaying(true)
          if (!player) pendingPlaybackRef.current = { time: action.time, isPlaying: true }
          if (player) {
            isRemoteRef.current = true
            player.currentTime = action.time
            void player.play().catch(() => {})
            setTimeout(() => {
              isRemoteRef.current = false
            }, 600)
          }
          break
        }
        case 'pause': {
          setIsPlaying(false)
          if (!player) pendingPlaybackRef.current = { time: action.time, isPlaying: false }
          if (player) {
            isRemoteRef.current = true
            player.currentTime = action.time
            player.pause()
            setTimeout(() => {
              isRemoteRef.current = false
            }, 600)
          }
          break
        }
        case 'seek': {
          if (!player) pendingPlaybackRef.current = { ...pendingPlaybackRef.current, time: action.time }
          if (player) {
            isRemoteRef.current = true
            player.currentTime = action.time
            setTimeout(() => {
              isRemoteRef.current = false
            }, 600)
          }
          break
        }
        case 'episode': {
          if (action.mediaTitle) setMediaTitle(action.mediaTitle)
          if (action.episodeTitle) setEpisodeTitle(action.episodeTitle)
          if (action.posterUrl) setPosterUrl(action.posterUrl)
          if (action.videoUrl && action.videoUrl !== videoUrlRef.current) {
            videoUrlRef.current = action.videoUrl
            setVideoUrl(action.videoUrl)
            pendingPlaybackRef.current = { time: action.time || 0, isPlaying: action.isPlaying }
            break
          }
          if (player) {
            isRemoteRef.current = true
            player.currentTime = action.time || 0
            setTimeout(() => {
              isRemoteRef.current = false
            }, 600)
          }
          break
        }
        case 'room_closed': {
          terminateSession(action.message || '房主已解散放映厅，本次放映结束。')
          break
        }
      }
    })

    // Listen to presence events
    channel.on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState()
      const userList: WatchPartyParticipant[] = []
      Object.values(presenceState).forEach(items => {
        ;(items as Array<Record<string, unknown>>).forEach(item => {
          userList.push({
            id: String(item.clientId || ''),
            name: String(item.name || '观众'),
            isHost: Boolean(item.isHost),
          })
        })
      })
      setParticipants(userList)

      const isHostPresent = userList.some(u => u.isHost)
      if (isHostPresent) {
        setHostOnline(true)
        setHostEverConnected(true)
      } else {
        setHostOnline(false)
      }
    })

    // Subscribe and request initial state
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        subscribed = true
        void channel.track({
          clientId: myClientIdRef.current,
          name: `访客_${myClientIdRef.current.substring(6)}`,
          isHost: false,
        })

        // Ask host for stream and initial progress
        requestState()
      } else {
        subscribed = false
      }
    })

    return () => {
      window.clearInterval(retryState)
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
      }
      void channel.unsubscribe()
      if (syncClient) {
        void syncClient.removeChannel(channel)
      }
    }
  }, [roomId, terminateSession])

  // Monitor host disconnect with strict 30-second countdown
  useEffect(() => {
    // If host has ever been connected, but is now offline, start 30s countdown
    if (hostEverConnected && !hostOnline && !terminatedReason) {
      if (artRef.current) {
        artRef.current.pause()
        setIsPlaying(false)
      }

      setDisconnectCountdown(30)

      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
      let count = 30
      countdownTimerRef.current = setInterval(() => {
        count -= 1
        setDisconnectCountdown(count)
        if (count <= 0) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current)
            countdownTimerRef.current = null
          }
          terminateSession('房主已离线超时（超过 30 秒），放映已自动关闭。')
        }
      }, 1000)
    } else if (hostOnline) {
      // Host came back! Clear countdown timer
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
      setDisconnectCountdown(null)
    }

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
    }
  }, [hostEverConnected, hostOnline, terminatedReason, terminateSession])

  // Initialize or update Artplayer instance
  useEffect(() => {
    if (!videoUrl || !containerRef.current || terminatedReason) return

    let isDestroyed = false

    const initPlayer = async () => {
      try {
        const HlsClass = await import('hls.js/dist/hls.light.mjs').then(
          m => m.default as typeof import('hls.js')['default'],
        )
        if (isDestroyed || !containerRef.current) return

        if (artRef.current) {
          artRef.current.destroy(true)
          artRef.current = null
        }

        const art = new Artplayer({
          container: containerRef.current,
          url: videoUrl,
          volume: 0.8,
          autoSize: true,
          fullscreen: true,
          fullscreenWeb: true,
          miniProgressBar: true,
          playsInline: true,
          theme: '#ef4444',
          lang: 'zh-cn',
          moreVideoAttr: {
            crossOrigin: 'anonymous',
            playsInline: true,
          },
          customType: {
            m3u8: (video: HTMLMediaElement, url: string, player: Artplayer) => {
              if (HlsClass.isSupported()) {
                const hls = new HlsClass()
                hls.loadSource(url)
                hls.attachMedia(video)
                ;(player as unknown as { hls?: unknown }).hls = hls
                player.on('destroy', () => hls.destroy())
              } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url
              }
            },
          },
        })

        // In host-controlled mode, notify and restore if user seeks locally
        art.on('video:seeked', () => {
          if (!isRemoteRef.current) {
            art.notice.show = '🔒 房主主控模式 · 进度自动对齐'
          }
        })

        artRef.current = art
        art.on('ready', () => {
          const pending = pendingPlaybackRef.current
          if (!pending) return
          pendingPlaybackRef.current = null
          isRemoteRef.current = true
          art.currentTime = pending.time
          if (pending.isPlaying) void art.play().catch(() => {})
          else if (pending.isPlaying === false) art.pause()
          setTimeout(() => { isRemoteRef.current = false }, 600)
        })
      } catch (err) {
        console.error('Failed to init guest player:', err)
      }
    }

    void initPlayer()

    return () => {
      isDestroyed = true
      if (artRef.current) {
        artRef.current.destroy(true)
        artRef.current = null
      }
    }
  }, [videoUrl, terminatedReason])

  const handleLeave = () => {
    terminateSession('你已主动退出放映厅')
    if (account) {
      navigate('/')
    } else {
      window.location.href = '/'
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-zinc-950 text-white selection:bg-red-500/30 overflow-x-hidden font-sans">
      {/* Cinematic Ambient Backlight Glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[850px] h-[450px] bg-gradient-to-b from-red-600/15 via-purple-600/10 to-transparent blur-[120px] rounded-full opacity-60 z-0" />

      {/* Top Floating Frosted Glass HUD */}
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-white/10 bg-zinc-950/75 px-4 backdrop-blur-xl sm:px-6">
        {/* Left: Film info */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-red-600/20 border border-red-500/30 text-red-500 shadow-inner">
            <Film className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm sm:text-base font-semibold text-zinc-100">
                {mediaTitle ? `《${mediaTitle}》` : inviter ? `「${inviter}」的放映厅` : '同步放映厅'}
              </h1>
              <Badge
                variant="outline"
                className="hidden border-white/15 bg-white/5 text-[10px] text-zinc-300 font-normal sm:inline-flex"
              >
                VIP 影厅
              </Badge>
            </div>
            {episodeTitle && (
              <p className="truncate text-xs text-zinc-400">
                {episodeTitle} · 房主实时同屏
              </p>
            )}
          </div>
        </div>

        {/* Center: Live status badge */}
        <div className="hidden md:flex items-center">
          {terminatedReason ? (
            <div className="flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-400">
              <span className="size-2 rounded-full bg-red-500" />
              <span>放映已结束</span>
            </div>
          ) : disconnectCountdown !== null ? (
            <div className="flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs text-amber-300 animate-pulse shadow-sm shadow-amber-500/20">
              <WifiOff className="size-3.5" />
              <span>房主信号中断 · 正在等待恢复 ({disconnectCountdown}s)</span>
            </div>
          ) : videoUrl ? (
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
              <span
                className={`size-2 rounded-full ${isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}
              />
              <span>{isPlaying ? '实时同步放映中' : `${inviter || '房主'}已暂停`}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-400">
              <span className="size-2 rounded-full bg-amber-400/80 animate-ping" />
              <span>等待房主开启放映...</span>
            </div>
          )}
        </div>

        {/* Right: Room guests pill & Exit button */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300">
            <Users className="size-3 text-zinc-400" />
            <span>{Math.max(participants.length, 1)} 人在座</span>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleLeave}
            className="h-8 gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-zinc-300 hover:border-red-500/30 hover:bg-red-500/15 hover:text-red-300 transition-colors"
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">退出影厅</span>
          </Button>
        </div>
      </header>

      {/* Main Cinema Content */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center p-3 sm:p-6 md:p-8">
        {terminatedReason ? (
          /* Terminated Curtain Screen */
          <div className="flex w-full max-w-md flex-col items-center rounded-3xl border border-white/10 bg-zinc-900/80 p-8 text-center shadow-2xl backdrop-blur-2xl">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-zinc-400 shadow-inner">
              <Film className="size-8" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-100">
              放映已圆满结束
            </h2>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              {terminatedReason}
            </p>
            <Button
              type="button"
              className="mt-6 w-full rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium shadow-md shadow-red-600/20"
              onClick={handleLeave}
            >
              {account ? '返回主站' : '返回登录页'}
            </Button>
          </div>
        ) : !videoUrl ? (
          /* VIP Lounge Waiting Screen */
          <div className="relative flex w-full max-w-lg flex-col items-center rounded-3xl border border-white/10 bg-zinc-900/60 p-8 sm:p-10 text-center shadow-2xl backdrop-blur-xl overflow-hidden">
            {/* Ambient poster blur glow */}
            {posterUrl && (
              <div
                className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center opacity-20 blur-3xl scale-125 transition-opacity duration-1000"
                style={{ backgroundImage: `url(${posterUrl})` }}
              />
            )}

            <div className="relative mb-6">
              {posterUrl ? (
                <div className="relative w-28 sm:w-32 aspect-[2/3] overflow-hidden rounded-2xl border border-white/20 shadow-2xl bg-zinc-900/80">
                  <img
                    src={posterUrl}
                    alt={mediaTitle || '海报封面'}
                    className="size-full object-cover shadow-inner"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                  <Badge
                    variant="secondary"
                    className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] bg-red-600/90 text-white border-0 shadow-sm whitespace-nowrap"
                  >
                    即将开播
                  </Badge>
                </div>
              ) : (
                <div className="flex size-20 items-center justify-center rounded-3xl bg-gradient-to-tr from-red-600/25 via-purple-600/20 to-amber-500/20 border border-white/15 shadow-xl backdrop-blur-md">
                  <Popcorn className="size-10 text-amber-400 animate-bounce" />
                </div>
              )}
              <Sparkles className="absolute -top-2 -right-2 size-5 text-amber-300 animate-pulse" />
            </div>

            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
              {inviter ? `欢迎来到「${inviter}」的专属影厅` : '欢迎来到私享放映厅'}
            </h2>
            {mediaTitle && (
              <p className="mt-1 text-sm font-medium text-amber-400">
                《{mediaTitle}》{episodeTitle ? ` · ${episodeTitle}` : ''}
              </p>
            )}
            <p className="mt-2 text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-sm">
              {inviter
                ? `「${inviter}」正在为你调试放映设备，入场就绪，稍后开播...`
                : '房主正在为你挑选片源与调试设备，入场就绪，稍后开播...'}
            </p>

            <div className="mt-8 flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-300 shadow-inner">
              <span className="size-2 rounded-full bg-amber-400 animate-ping" />
              <span>喝杯可乐稍等片刻，放映即将开始 🍿</span>
            </div>

            <div className="mt-8 flex items-center justify-center gap-2 text-xs text-zinc-500">
              <span>房间号:</span>
              <code className="rounded bg-black/40 px-2 py-0.5 font-mono text-zinc-400 border border-white/5">
                {roomId}
              </code>
            </div>
          </div>
        ) : (
          /* Active Cinema Player Container */
          <div className="relative w-full max-w-6xl">
            {/* Host Disconnect 30s Floating Countdown Alert */}
            {disconnectCountdown !== null && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 rounded-full border border-amber-500/40 bg-zinc-950/90 px-4 py-2 text-xs text-amber-300 shadow-2xl backdrop-blur-xl">
                <AlertTriangle className="size-4 shrink-0 text-amber-400" />
                <span>
                  房主连接暂时中断，已暂停画面。重连等待中：
                  <strong className="ml-1 text-sm font-bold text-amber-400 font-mono">
                    {disconnectCountdown}s
                  </strong>
                </span>
              </div>
            )}

            {/* Video Player Frame with Cinema Depth Shadow */}
            <div className="group relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black ring-1 ring-white/5">
              <div
                id="guest-player"
                ref={containerRef}
                className="h-full w-full [&_.art-video-player]:!h-full [&_.art-video-player]:!w-full [&_.artplayer-app]:!h-full [&_.artplayer-app]:!w-full [&_video]:!h-full [&_video]:!w-full"
              />
            </div>

            {/* Cinema Screen Footer Bar */}
            <div className="mt-3 flex items-center justify-between px-1 text-xs text-zinc-400">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 font-medium text-zinc-300">
                  <Crown className="size-3.5 text-amber-400" />
                  房主主控同屏
                </span>
                <span>·</span>
                <span className="opacity-75">进度由房主统一调控，本地可自由调节音量与全屏</span>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 opacity-60">
                <span>画质：</span>
                <span className="font-mono text-zinc-300">1080P 原画</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
