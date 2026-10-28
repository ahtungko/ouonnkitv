import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router'
import type Artplayer from 'artplayer'
import { syncClient } from '@/shared/sync/client'
import { useAuthStore } from '@/shared/store/authStore'
import { isWatchPartyChatMessage } from '../lib/watchPartyChat'

export type WatchPartyMode = 'host_only' | 'collaborative' | 'guest_cinema'
export type WatchPartyActionType =
  | 'play'
  | 'pause'
  | 'seek'
  | 'episode'
  | 'heartbeat'
  | 'request_state'
  | 'state_sync'
  | 'room_closed'

export interface WatchPartyAction {
  type: WatchPartyActionType
  time: number
  episodeIndex?: number
  videoUrl?: string
  mediaTitle?: string
  episodeTitle?: string
  posterUrl?: string
  adFilteringEnabled?: boolean
  mode?: WatchPartyMode
  senderId?: string
  senderName?: string
  isPlaying?: boolean
  message?: string
}

export interface WatchPartyChatMessage {
  id: string
  senderId: string
  senderName: string
  isHost?: boolean
  text: string
  timestamp: number
}

export interface WatchPartyParticipant {
  id: string
  name: string
  isHost: boolean
}

interface UseWatchPartyOptions {
  art: Artplayer | null
  selectedEpisode: number
  onSelectEpisode: (index: number) => void
  showNotice: (msg: string) => void
  currentVideoUrl?: string
  mediaTitle?: string
  episodeTitle?: string
  posterUrl?: string
  adFilteringEnabled?: boolean
}

function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 9)
}

const HOST_SESSION_KEY = 'xkatv-watch-party-host'

function readHostSession(): { roomId: string; accountId: string; mode: WatchPartyMode } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(HOST_SESSION_KEY) || 'null')
    return value && typeof value.roomId === 'string' && typeof value.accountId === 'string' &&
      (value.mode === 'host_only' || value.mode === 'collaborative' || value.mode === 'guest_cinema')
      ? value : null
  } catch {
    return null
  }
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function useWatchParty({
  art,
  selectedEpisode,
  onSelectEpisode,
  showNotice,
  currentVideoUrl,
  mediaTitle,
  episodeTitle,
  posterUrl,
  adFilteringEnabled,
}: UseWatchPartyOptions) {
  const [searchParams, setSearchParams] = useSearchParams()
  const accountUsername = useAuthStore(state => state.account?.username)
  const accountId = useAuthStore(state => state.account?.id)

  const [isPartyActive, setIsPartyActive] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [mode, setMode] = useState<WatchPartyMode>('host_only')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [participants, setParticipants] = useState<WatchPartyParticipant[]>([])
  const [messages, setMessages] = useState<WatchPartyChatMessage[]>([])
  const [danmakuEnabled, setDanmakuEnabled] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')

  const modeRef = useRef(mode)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  // Keep references to avoid stale closures in callbacks
  const artRef = useRef<Artplayer | null>(art)
  useEffect(() => {
    artRef.current = art
  }, [art])

  const currentVideoUrlRef = useRef(currentVideoUrl)
  useEffect(() => {
    currentVideoUrlRef.current = currentVideoUrl
  }, [currentVideoUrl])

  const mediaTitleRef = useRef(mediaTitle)
  useEffect(() => {
    mediaTitleRef.current = mediaTitle
  }, [mediaTitle])

  const episodeTitleRef = useRef(episodeTitle)
  useEffect(() => {
    episodeTitleRef.current = episodeTitle
  }, [episodeTitle])

  const posterUrlRef = useRef(posterUrl)
  useEffect(() => {
    posterUrlRef.current = posterUrl
  }, [posterUrl])

  const adFilteringRef = useRef(adFilteringEnabled)
  useEffect(() => {
    adFilteringRef.current = adFilteringEnabled
  }, [adFilteringEnabled])

  const selectedEpisodeRef = useRef(selectedEpisode)
  useEffect(() => {
    selectedEpisodeRef.current = selectedEpisode
  }, [selectedEpisode])

  const onSelectEpisodeRef = useRef(onSelectEpisode)
  useEffect(() => {
    onSelectEpisodeRef.current = onSelectEpisode
  }, [onSelectEpisode])

  const showNoticeRef = useRef(showNotice)
  useEffect(() => {
    showNoticeRef.current = showNotice
  }, [showNotice])

  const channelRef = useRef<ReturnType<NonNullable<typeof syncClient>['channel']> | null>(null)
  const isRemoteEventRef = useRef(false)
  const myClientIdRef = useRef<string>(`user_${Math.random().toString(36).substring(2, 8)}`)
  const currentUsernameRef = useRef<string>('')
  const pendingSyncRef = useRef<{ time: number; isPlaying?: boolean } | null>(null)
  const roomIdRef = useRef<string | null>(null)
  const userExitedRoomIdRef = useRef<string | null>(null)
  const hostMissingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    roomIdRef.current = roomId
  }, [roomId])

  currentUsernameRef.current =
    accountUsername || `访客_${myClientIdRef.current.substring(5)}`

  const isSupabaseAvailable = Boolean(syncClient)

  // Apply pending sync once art becomes available
  useEffect(() => {
    if (art && pendingSyncRef.current) {
      const { time, isPlaying } = pendingSyncRef.current
      pendingSyncRef.current = null
      isRemoteEventRef.current = true
      art.currentTime = time
      if (isPlaying) {
        void art.play().catch(() => {})
      } else {
        art.pause()
      }
      setTimeout(() => {
        isRemoteEventRef.current = false
      }, 600)
    }
  }, [art])

  // Broadcast an action to the room
  const broadcastAction = useCallback(
    (action: Omit<WatchPartyAction, 'senderId' | 'senderName'>) => {
      if (!channelRef.current || !isPartyActive || isRemoteEventRef.current) return

      // Non-host in host_only or guest_cinema mode cannot broadcast control actions (except state requests)
      if (
        (mode === 'host_only' || mode === 'guest_cinema') &&
        !isHost &&
        action.type !== 'heartbeat' &&
        action.type !== 'request_state'
      ) {
        showNoticeRef.current('当前为房主主控模式，仅房主可控制进度')
        return
      }

      const fullAction: WatchPartyAction = {
        ...action,
        senderId: myClientIdRef.current,
        senderName: currentUsernameRef.current,
      }

      void channelRef.current.send({
        type: 'broadcast',
        event: 'party_action',
        payload: fullAction,
      })
    },
    [isPartyActive, mode, isHost],
  )

  // Send a chat message to the room
  const sendChatMessage = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim()
      const channel = channelRef.current
      if (!trimmed || trimmed.length > 100 || !channel || !isPartyActive) return false

      const chatMsg: WatchPartyChatMessage = {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        senderId: myClientIdRef.current,
        senderName: currentUsernameRef.current,
        isHost,
        text: trimmed,
        timestamp: Date.now(),
      }

      try {
        const result = await channel.send({ type: 'broadcast', event: 'party_chat', payload: chatMsg })
        if (result !== 'ok' || channelRef.current !== channel) return false
        setMessages(prev => [...prev.slice(-99), chatMsg])
        return true
      } catch {
        return false
      }
    },
    [isPartyActive, isHost],
  )

  // Leave room logic
  const leaveParty = useCallback(async () => {
    const leavingRoom = roomIdRef.current || new URLSearchParams(window.location.search).get('partyRoom')
    if (isHost && leavingRoom && syncClient) {
      try {
        const { error } = await syncClient.rpc('close_watch_party_room', { p_room_id: leavingRoom })
        if (error) throw new Error(error.message)
      } catch (error) {
        showNoticeRef.current(`无法关闭放映厅，请重试：${error instanceof Error ? error.message : String(error)}`)
        return false
      }
    }
    if (hostMissingTimerRef.current) clearTimeout(hostMissingTimerRef.current)
    hostMissingTimerRef.current = null
    // Record the room id we are leaving so the auto-connect effect doesn't immediately rejoin it
    userExitedRoomIdRef.current =
      roomIdRef.current || new URLSearchParams(window.location.search).get('partyRoom')

    try {
      if (readHostSession()?.roomId === userExitedRoomIdRef.current) sessionStorage.removeItem(HOST_SESSION_KEY)
    } catch {
      // Session storage can be unavailable in restricted browser modes.
    }

    if (channelRef.current && syncClient) {
      const channel = channelRef.current
      const client = syncClient
      channelRef.current = null
      const disconnect = () => {
        void channel.unsubscribe()
        void client.removeChannel(channel)
      }
      if (isHost) {
        void channel.send({
          type: 'broadcast',
          event: 'party_action',
          payload: {
            type: 'room_closed',
            time: 0,
            message: '房主已解散放映厅',
            senderId: myClientIdRef.current,
            senderName: currentUsernameRef.current,
          },
        }).catch(() => {}).finally(disconnect)
      } else disconnect()
    }

    setIsPartyActive(false)
    setIsHost(false)
    setRoomId(null)
    setParticipants([])
    setMessages([])
    setInviteUrl('')
    pendingSyncRef.current = null

    // Synchronously clean the URL in window.history as well as React Router
    try {
      const currentUrl = new URL(window.location.href)
      currentUrl.searchParams.delete('partyRoom')
      currentUrl.searchParams.delete('partyMode')
      currentUrl.searchParams.delete('partyEp')
      currentUrl.searchParams.delete('inviter')
      currentUrl.searchParams.delete('partyInviter')
      currentUrl.searchParams.delete('poster')
      window.history.replaceState(null, '', currentUrl.toString())
    } catch {
      // Ignore in non-browser env
    }

    // Remove party params from URL
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev)
        next.delete('partyRoom')
        next.delete('partyMode')
        next.delete('partyEp')
        next.delete('inviter')
        next.delete('partyInviter')
        next.delete('poster')
        return next
      },
      { replace: true },
    )

    showNoticeRef.current('已退出同步放映室')
    return true
  }, [isHost, setSearchParams])

  const leavePartyRef = useRef(leaveParty)
  leavePartyRef.current = leaveParty

  // Join or setup a room
  const connectToRoom = useCallback(
    (targetRoomId: string, roomMode: WatchPartyMode, asHost: boolean) => {
      userExitedRoomIdRef.current = null
      if (!syncClient) {
        showNoticeRef.current('未配置 Supabase，无法连接放映室')
        return
      }

      // Cleanup any existing channel
      if (channelRef.current) {
        if (hostMissingTimerRef.current) clearTimeout(hostMissingTimerRef.current)
        hostMissingTimerRef.current = null
        void channelRef.current.unsubscribe()
        void syncClient.removeChannel(channelRef.current)
        channelRef.current = null
      }

      setRoomId(targetRoomId)
      setMode(roomMode)
      setIsHost(asHost)
      setIsPartyActive(true)
      setMessages([])

      const channelName = `watch_party_${targetRoomId}`
      const channel = syncClient.channel(channelName, {
        config: {
          broadcast: { self: false },
          presence: { key: myClientIdRef.current },
        },
      })

      // Listen for control actions
      channel.on('broadcast', { event: 'party_action' }, ({ payload }) => {
        const action = payload as WatchPartyAction
        if (!action || action.senderId === myClientIdRef.current) return

        const player = artRef.current

        if (action.type === 'room_closed' && !asHost) {
          void leavePartyRef.current()
          showNoticeRef.current(action.message || '房主已解散放映厅')
          return
        }

        // Handle newcomer asking for the current state (Host answers)
        if (action.type === 'request_state') {
          if (asHost) {
            void channel.send({
              type: 'broadcast',
              event: 'party_action',
              payload: {
                type: 'state_sync',
                time: player?.currentTime || 0,
                isPlaying: Boolean(player && !player.video.paused),
                episodeIndex: selectedEpisodeRef.current,
                videoUrl: currentVideoUrlRef.current,
                mediaTitle: mediaTitleRef.current,
                episodeTitle: episodeTitleRef.current,
                posterUrl: posterUrlRef.current,
                adFilteringEnabled: adFilteringRef.current,
                mode: modeRef.current,
                senderId: myClientIdRef.current,
                senderName: currentUsernameRef.current,
              },
            })
          }
          return
        }

        // Handle receiving initial state sync
        if (action.type === 'state_sync') {
          showNoticeRef.current(`[一起看] 已同步房主当前进度`)
          if (
            typeof action.episodeIndex === 'number' &&
            action.episodeIndex !== selectedEpisodeRef.current
          ) {
            onSelectEpisodeRef.current(action.episodeIndex)
          }

          if (player) {
            isRemoteEventRef.current = true
            player.currentTime = action.time
            if (action.isPlaying) {
              void player.play().catch(() => {})
            } else {
              player.pause()
            }
            setTimeout(() => {
              isRemoteEventRef.current = false
            }, 600)
          } else {
            pendingSyncRef.current = { time: action.time, isPlaying: action.isPlaying }
          }
          return
        }

        isRemoteEventRef.current = true
        try {
          switch (action.type) {
            case 'play': {
              showNoticeRef.current(`[一起看] ${action.senderName || '对方'} 开始播放`)
              if (player) {
                const current = player.currentTime || 0
                if (Math.abs(current - action.time) > 1.8) {
                  player.currentTime = action.time
                }
                void player.play().catch(() => {})
              } else {
                pendingSyncRef.current = { time: action.time, isPlaying: true }
              }
              break
            }
            case 'pause': {
              showNoticeRef.current(`[一起看] ${action.senderName || '对方'} 暂停了播放`)
              if (player) {
                player.currentTime = action.time
                player.pause()
              } else {
                pendingSyncRef.current = { time: action.time, isPlaying: false }
              }
              break
            }
            case 'seek': {
              showNoticeRef.current(
                `[一起看] ${action.senderName || '对方'} 跳转至 ${formatTimestamp(action.time)}`,
              )
              if (player) {
                player.currentTime = action.time
              } else {
                pendingSyncRef.current = { time: action.time }
              }
              break
            }
            case 'episode': {
              if (
                typeof action.episodeIndex === 'number' &&
                action.episodeIndex !== selectedEpisodeRef.current
              ) {
                showNoticeRef.current(
                  `[一起看] ${action.senderName || '房主'} 切换到了第 ${action.episodeIndex + 1} 集`,
                )
                onSelectEpisodeRef.current(action.episodeIndex)
              }
              break
            }
            case 'heartbeat': {
              // Only viewers sync from host heartbeat
              if (!asHost) {
                if (player) {
                  const current = player.currentTime || 0
                  const diff = Math.abs(current - action.time)
                  if (diff > 2.5) {
                    player.currentTime = action.time
                  }
                  if (action.isPlaying && player.video && player.video.paused) {
                    void player.play().catch(() => {})
                  } else if (!action.isPlaying && player.video && !player.video.paused) {
                    player.pause()
                  }
                }
              }
              break
            }
          }
        } finally {
          setTimeout(() => {
            isRemoteEventRef.current = false
          }, 600)
        }
      })

      // Listen for chat messages
      channel.on('broadcast', { event: 'party_chat' }, ({ payload }) => {
        if (!isWatchPartyChatMessage(payload) || payload.senderId === myClientIdRef.current) return
        const chat = payload
        setMessages(prev => [...prev.slice(-99), chat])
      })

      // Listen for presence changes
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
        if (!asHost) {
          if (userList.some(user => user.isHost)) {
            if (hostMissingTimerRef.current) clearTimeout(hostMissingTimerRef.current)
            hostMissingTimerRef.current = null
          } else if (!hostMissingTimerRef.current) {
            hostMissingTimerRef.current = setTimeout(() => {
              hostMissingTimerRef.current = null
              void leavePartyRef.current()
              showNoticeRef.current('房主已离线超时，放映厅已关闭')
            }, 30_000)
          }
        }
      })

      // Subscribe and track presence
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          void channel.track({
            clientId: myClientIdRef.current,
            name: currentUsernameRef.current,
            isHost: asHost,
          })

          const modeLabel =
            roomMode === 'host_only'
              ? '房主主控'
              : roomMode === 'collaborative'
                ? '全员自由'
                : '免登录专属影厅'

          showNoticeRef.current(
            asHost ? `放映室已建立 (${modeLabel})` : `已加入放映室 (${modeLabel})`,
          )

          // If joined as viewer, ask host for current progress
          if (!asHost) {
            void channel.send({
              type: 'broadcast',
              event: 'party_action',
              payload: {
                type: 'request_state',
                senderId: myClientIdRef.current,
                senderName: currentUsernameRef.current,
              },
            })
          }
        }
      })

      channelRef.current = channel
    },
    [],
  )

  // Create room
  const createParty = useCallback(
    async (selectedMode: WatchPartyMode): Promise<string> => {
      userExitedRoomIdRef.current = null
      const newRoomId = generateRoomId()
      if (!syncClient || !accountId) {
        showNoticeRef.current('请登录并配置 Supabase 后创建放映室')
        return ''
      }
      try {
        const { error } = await syncClient.rpc('create_watch_party_room', {
          p_room_id: newRoomId,
          p_mode: selectedMode,
        })
        if (error) throw new Error(error.message)
      } catch (error) {
        showNoticeRef.current(`无法创建放映厅，请重试：${error instanceof Error ? error.message : String(error)}`)
        return ''
      }
      if (syncClient && accountId) {
        try {
          sessionStorage.setItem(HOST_SESSION_KEY, JSON.stringify({ roomId: newRoomId, accountId, mode: selectedMode }))
        } catch {
          showNoticeRef.current('浏览器无法保存房主身份，刷新后可能需要重新创建放映室')
        }
      }
      connectToRoom(newRoomId, selectedMode, true)

      const inviter = accountUsername || ''
      const poster = posterUrlRef.current || ''
      let fullUrl = ''
      if (selectedMode === 'guest_cinema') {
        const params = new URLSearchParams()
        if (inviter) params.set('i', inviter)
        const qs = params.toString() ? `?${params.toString()}` : ''
        fullUrl = `${window.location.origin}/p/${newRoomId}${qs}`
      } else {
        const url = new URL(window.location.href)
        url.searchParams.set('partyRoom', newRoomId)
        url.searchParams.set('partyMode', selectedMode)
        url.searchParams.set('partyEp', String(selectedEpisodeRef.current))
        if (inviter) {
          url.searchParams.set('inviter', inviter)
        }
        url.searchParams.delete('poster')
        fullUrl = url.toString()
      }

      // Update current URL without reload (host keeps party params in URL)
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          next.set('partyRoom', newRoomId)
          next.set('partyMode', selectedMode)
          next.set('partyEp', String(selectedEpisodeRef.current))
          if (inviter) {
            next.set('inviter', inviter)
          }
          if (poster) {
            next.set('poster', poster)
          }
          return next
        },
        { replace: true },
      )

      setInviteUrl(fullUrl)
      return fullUrl
    },
    [accountId, accountUsername, connectToRoom, setSearchParams],
  )

  // Auto-connect if URL has partyRoom
  useEffect(() => {
    const urlRoomId = searchParams.get('partyRoom')
    const urlMode = (searchParams.get('partyMode') as WatchPartyMode) || 'host_only'
    const urlEp = searchParams.get('partyEp')
    const urlInviter = searchParams.get('inviter') || searchParams.get('partyInviter')

    // If there is no partyRoom in URL, clear exited marker
    if (!urlRoomId) {
      userExitedRoomIdRef.current = null
      return
    }

    // If this room was explicitly exited by the user, do not auto-reconnect
    if (userExitedRoomIdRef.current === urlRoomId) {
      return
    }

    // If joining a link with specific episode, sync episode right away
    if (urlEp !== null) {
      const epIndex = Number(urlEp)
      if (
        Number.isInteger(epIndex) &&
        epIndex >= 0 &&
        epIndex !== selectedEpisodeRef.current
      ) {
        onSelectEpisodeRef.current(epIndex)
      }
    }

    if (!isPartyActive && syncClient) {
      const hostSession = readHostSession()
      const restoreHost = !!accountId && hostSession?.accountId === accountId && hostSession.roomId === urlRoomId
      let cancelled = false
      void (async () => {
        try {
          const { data, error } = await syncClient.rpc('watch_party_room_status', { p_room_id: urlRoomId })
          if (error) throw new Error(error.message)
          if (cancelled) return
          if (data !== 'open') {
            userExitedRoomIdRef.current = urlRoomId
            showNoticeRef.current('放映厅已结束或链接无效')
            return
          }
          connectToRoom(urlRoomId, restoreHost ? hostSession.mode : urlMode, restoreHost)
          setInviteUrl(window.location.href)
          if (urlInviter && !restoreHost) showNotice(`👋「${urlInviter}」邀请你加入了放映室`)
        } catch (error) {
          if (!cancelled) showNoticeRef.current(`无法检查放映厅状态，请刷新重试：${error instanceof Error ? error.message : String(error)}`)
        }
      })()
      return () => { cancelled = true }
    }
  }, [searchParams, isPartyActive, connectToRoom, showNotice, accountId])

  // Keep inviteUrl synchronized when room is active and episode or mode changes
  useEffect(() => {
    if (isPartyActive && roomId) {
      try {
        const inviter = accountUsername || ''
        if (mode === 'guest_cinema') {
          const params = new URLSearchParams()
          if (inviter) params.set('i', inviter)
          const qs = params.toString() ? `?${params.toString()}` : ''
          setInviteUrl(`${window.location.origin}/p/${roomId}${qs}`)
        } else {
          const url = new URL(window.location.href)
          url.searchParams.set('partyRoom', roomId)
          url.searchParams.set('partyMode', mode)
          url.searchParams.set('partyEp', String(selectedEpisode))
          if (inviter) {
            url.searchParams.set('inviter', inviter)
          }
          url.searchParams.delete('poster')
          setInviteUrl(url.toString())
        }
      } catch {
        // Ignore in non-browser env
      }
    }
  }, [isPartyActive, roomId, mode, selectedEpisode, accountUsername, posterUrl])

  // Host heartbeat to keep viewers aligned
  useEffect(() => {
    if (!isPartyActive || !isHost) return

    const interval = setInterval(() => {
      const player = artRef.current
      if (!player || !player.video) return
      broadcastAction({
        type: 'heartbeat',
        time: player.currentTime || 0,
        isPlaying: !player.video.paused,
        ...(mode === 'guest_cinema' ? {
          videoUrl: currentVideoUrlRef.current,
          mediaTitle: mediaTitleRef.current,
          episodeTitle: episodeTitleRef.current,
          posterUrl: posterUrlRef.current,
          adFilteringEnabled: adFilteringRef.current,
        } : {}),
      })
    }, 2000)

    return () => clearInterval(interval)
  }, [isPartyActive, isHost, mode, broadcastAction])

  // Listen to Artplayer events to broadcast
  useEffect(() => {
    if (!art || !isPartyActive) return

    const handlePlay = () => {
      if (isRemoteEventRef.current) return
      broadcastAction({
        type: 'play',
        time: art.currentTime || 0,
      })
    }

    const handlePause = () => {
      if (isRemoteEventRef.current) return
      broadcastAction({
        type: 'pause',
        time: art.currentTime || 0,
      })
    }

    const handleSeeked = () => {
      if (isRemoteEventRef.current) return
      broadcastAction({
        type: 'seek',
        time: art.currentTime || 0,
      })
    }

    art.on('video:play', handlePlay)
    art.on('video:pause', handlePause)
    art.on('video:seeked', handleSeeked)

    return () => {
      art.off('video:play', handlePlay)
      art.off('video:pause', handlePause)
      art.off('video:seeked', handleSeeked)
    }
  }, [art, isPartyActive, broadcastAction])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hostMissingTimerRef.current) clearTimeout(hostMissingTimerRef.current)
      hostMissingTimerRef.current = null
      if (channelRef.current && syncClient) {
        void channelRef.current.unsubscribe()
        void syncClient.removeChannel(channelRef.current)
      }
    }
  }, [])

  return {
    isPartyActive,
    isHost,
    mode,
    roomId,
    participants,
    participantCount: Math.max(participants.length, isPartyActive ? 1 : 0),
    isModalOpen,
    setIsModalOpen,
    inviteUrl,
    inviterName: accountUsername || null,
    posterUrl: posterUrl || null,
    isSupabaseAvailable,
    messages,
    danmakuEnabled,
    setDanmakuEnabled,
    sendChatMessage,
    createParty,
    leaveParty,
    broadcastAction,
  }
}
