import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router'
import type Artplayer from 'artplayer'
import { syncClient } from '@/shared/sync/client'
import { useAuthStore } from '@/shared/store/authStore'

export type WatchPartyMode = 'host_only' | 'collaborative'
export type WatchPartyActionType = 'play' | 'pause' | 'seek' | 'episode' | 'heartbeat'

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

  const channelRef = useRef<ReturnType<NonNullable<typeof syncClient>['channel']> | null>(null)
  const isRemoteEventRef = useRef(false)
  const myClientIdRef = useRef<string>(`user_${Math.random().toString(36).substring(2, 8)}`)
  const currentUsernameRef = useRef<string>('')

  currentUsernameRef.current =
    accountUsername || `访客_${myClientIdRef.current.substring(5)}`

  const isSupabaseAvailable = Boolean(syncClient)

  // Broadcast an action to the room
  const broadcastAction = useCallback(
    (action: Omit<WatchPartyAction, 'senderId' | 'senderName'>) => {
      if (!channelRef.current || !isPartyActive || isRemoteEventRef.current) return

      // Non-host in host_only mode cannot broadcast control actions
      if (mode === 'host_only' && !isHost && action.type !== 'heartbeat') {
        showNotice('当前为房主主控模式，仅房主可控制进度')
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
    [isPartyActive, mode, isHost, showNotice],
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

    // Remove party params from URL
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev)
        next.delete('partyRoom')
        next.delete('partyMode')
        return next
      },
      { replace: true },
    )

    showNotice('已退出同步放映室')
  }, [setSearchParams, showNotice])

  // Join or setup a room
  const connectToRoom = useCallback(
    (targetRoomId: string, roomMode: WatchPartyMode, asHost: boolean) => {
      if (!syncClient) {
        showNotice('未配置 Supabase，无法连接放映室')
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
        if (!action || action.senderId === myClientIdRef.current || !art) return

        isRemoteEventRef.current = true
        try {
          switch (action.type) {
            case 'play': {
              showNotice(`[一起看] ${action.senderName || '对方'} 开始播放`)
              const current = art.currentTime || 0
              if (Math.abs(current - action.time) > 1.8) {
                art.currentTime = action.time
              }
              void art.play().catch(() => {})
              break
            }
            case 'pause': {
              showNotice(`[一起看] ${action.senderName || '对方'} 暂停了播放`)
              art.currentTime = action.time
              art.pause()
              break
            }
            case 'seek': {
              showNotice(
                `[一起看] ${action.senderName || '对方'} 跳转至 ${formatTimestamp(action.time)}`,
              )
              art.currentTime = action.time
              break
            }
            case 'episode': {
              if (
                typeof action.episodeIndex === 'number' &&
                action.episodeIndex !== selectedEpisode
              ) {
                showNotice(
                  `[一起看] ${action.senderName || '房主'} 切换到了第 ${action.episodeIndex + 1} 集`,
                )
                onSelectEpisode(action.episodeIndex)
              }
              break
            }
            case 'heartbeat': {
              // Only viewers sync from host heartbeat
              if (!asHost) {
                const current = art.currentTime || 0
                const diff = Math.abs(current - action.time)
                if (diff > 2.5) {
                  art.currentTime = action.time
                }
                if (action.isPlaying && art.video && art.video.paused) {
                  void art.play().catch(() => {})
                } else if (!action.isPlaying && art.video && !art.video.paused) {
                  art.pause()
                }
              }
              break
            }
          }
        } finally {
          setTimeout(() => {
            isRemoteEventRef.current = false
          }, 350)
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
          showNotice(
            asHost
              ? `放映室已建立 (${roomMode === 'host_only' ? '房主主控' : '全员自由'})`
              : `已加入放映室 (${roomMode === 'host_only' ? '房主主控' : '全员自由'})`,
          )
        }
      })

      channelRef.current = channel
    },
    [art, selectedEpisode, onSelectEpisode, showNotice],
  )

  // Create room
  const createParty = useCallback(
    (selectedMode: WatchPartyMode): string => {
      const newRoomId = generateRoomId()
      connectToRoom(newRoomId, selectedMode, true)

      // Add to URL
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          next.set('partyRoom', newRoomId)
          next.set('partyMode', selectedMode)
          return next
        },
        { replace: true },
      )

      const url = new URL(window.location.href)
      url.searchParams.set('partyRoom', newRoomId)
      url.searchParams.set('partyMode', selectedMode)
      return url.toString()
    },
    [connectToRoom, setSearchParams],
  )

  // Auto-connect if URL has partyRoom
  useEffect(() => {
    const urlRoomId = searchParams.get('partyRoom')
    const urlMode = (searchParams.get('partyMode') as WatchPartyMode) || 'host_only'

    if (urlRoomId && !isPartyActive && syncClient) {
      // Connect as viewer
      connectToRoom(urlRoomId, urlMode, false)
    }
  }, [searchParams, isPartyActive, connectToRoom])

  // Host heartbeat to keep viewers aligned
  useEffect(() => {
    if (!isPartyActive || !isHost || !art) return

    const interval = setInterval(() => {
      if (!art.video) return
      broadcastAction({
        type: 'heartbeat',
        time: art.currentTime || 0,
        isPlaying: !art.video.paused,
      })
    }, 6000)

    return () => clearInterval(interval)
  }, [isPartyActive, isHost, art, broadcastAction])

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
    isSupabaseAvailable,
    createParty,
    leaveParty,
    broadcastAction,
  }
}
