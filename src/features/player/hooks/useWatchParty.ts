import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router'
import type Artplayer from 'artplayer'
import { syncClient } from '@/shared/sync/client'
import { useAuthStore } from '@/shared/store/authStore'

export type WatchPartyMode = 'host_only' | 'collaborative'
export type WatchPartyActionType =
  | 'play'
  | 'pause'
  | 'seek'
  | 'episode'
  | 'heartbeat'
  | 'request_state'
  | 'state_sync'

export interface WatchPartyAction {
  type: WatchPartyActionType
  time: number
  episodeIndex?: number
  senderId?: string
  senderName?: string
  isPlaying?: boolean
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
}

function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 9)
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
}: UseWatchPartyOptions) {
  const [searchParams, setSearchParams] = useSearchParams()
  const accountUsername = useAuthStore(state => state.account?.username)

  const [isPartyActive, setIsPartyActive] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [mode, setMode] = useState<WatchPartyMode>('host_only')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [participants, setParticipants] = useState<WatchPartyParticipant[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')

  // Keep references to avoid stale closures in callbacks
  const artRef = useRef<Artplayer | null>(art)
  useEffect(() => {
    artRef.current = art
  }, [art])

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

      // Non-host in host_only mode cannot broadcast control actions (except state requests)
      if (
        mode === 'host_only' &&
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

  // Leave room logic
  const leaveParty = useCallback(() => {
    if (channelRef.current && syncClient) {
      void channelRef.current.unsubscribe()
      void syncClient.removeChannel(channelRef.current)
      channelRef.current = null
    }

    setIsPartyActive(false)
    setIsHost(false)
    setRoomId(null)
    setParticipants([])
    setInviteUrl('')
    pendingSyncRef.current = null

    // Remove party params from URL
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev)
        next.delete('partyRoom')
        next.delete('partyMode')
        next.delete('partyEp')
        return next
      },
      { replace: true },
    )

    showNoticeRef.current('已退出同步放映室')
  }, [setSearchParams])

  // Join or setup a room
  const connectToRoom = useCallback(
    (targetRoomId: string, roomMode: WatchPartyMode, asHost: boolean) => {
      if (!syncClient) {
        showNoticeRef.current('未配置 Supabase，无法连接放映室')
        return
      }

      // Cleanup any existing channel
      if (channelRef.current) {
        void channelRef.current.unsubscribe()
        void syncClient.removeChannel(channelRef.current)
        channelRef.current = null
      }

      setRoomId(targetRoomId)
      setMode(roomMode)
      setIsHost(asHost)
      setIsPartyActive(true)

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
      })

      // Subscribe and track presence
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          void channel.track({
            clientId: myClientIdRef.current,
            name: currentUsernameRef.current,
            isHost: asHost,
          })

          showNoticeRef.current(
            asHost
              ? `放映室已建立 (${roomMode === 'host_only' ? '房主主控' : '全员自由'})`
              : `已加入放映室 (${roomMode === 'host_only' ? '房主主控' : '全员自由'})`,
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
    (selectedMode: WatchPartyMode): string => {
      const newRoomId = generateRoomId()
      connectToRoom(newRoomId, selectedMode, true)

      const url = new URL(window.location.href)
      url.searchParams.set('partyRoom', newRoomId)
      url.searchParams.set('partyMode', selectedMode)
      url.searchParams.set('partyEp', String(selectedEpisodeRef.current))

      // Update current URL without reload
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          next.set('partyRoom', newRoomId)
          next.set('partyMode', selectedMode)
          next.set('partyEp', String(selectedEpisodeRef.current))
          return next
        },
        { replace: true },
      )

      const fullUrl = url.toString()
      setInviteUrl(fullUrl)
      return fullUrl
    },
    [connectToRoom, setSearchParams],
  )

  // Auto-connect if URL has partyRoom
  useEffect(() => {
    const urlRoomId = searchParams.get('partyRoom')
    const urlMode = (searchParams.get('partyMode') as WatchPartyMode) || 'host_only'
    const urlEp = searchParams.get('partyEp')

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

    if (urlRoomId && !isPartyActive && syncClient) {
      // Connect as viewer
      connectToRoom(urlRoomId, urlMode, false)
      setInviteUrl(window.location.href)
    }
  }, [searchParams, isPartyActive, connectToRoom])

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
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [isPartyActive, isHost, broadcastAction])

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
    isSupabaseAvailable,
    createParty,
    leaveParty,
    broadcastAction,
  }
}
