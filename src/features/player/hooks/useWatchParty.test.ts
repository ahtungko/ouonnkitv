// @vitest-environment jsdom
import { act, createElement } from 'react'

// @ts-expect-error React act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useWatchParty } from './useWatchParty'

const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn((cb?: (status: string) => void) => {
    cb?.('SUBSCRIBED')
    return mockChannel
  }),
  unsubscribe: vi.fn(),
  send: vi.fn().mockResolvedValue(undefined),
  track: vi.fn().mockResolvedValue(undefined),
  presenceState: vi.fn().mockReturnValue({}),
}

const mockSyncClient = {
  channel: vi.fn().mockReturnValue(mockChannel),
  removeChannel: vi.fn(),
}

vi.mock('@/shared/sync/client', () => ({
  get syncClient() {
    return mockSyncClient
  },
}))

vi.mock('@/shared/store/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: any) => any) =>
    selector({ account: { username: 'testuser' } }),
  ),
}))

const mockSearchParams = new URLSearchParams()
const mockSetSearchParams = vi.fn()

vi.mock('react-router', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}))

describe('useWatchParty', () => {
  let host: HTMLElement
  let root: Root
  let currentResult: ReturnType<typeof useWatchParty>

  function TestHarness(props: {
    onNotice?: (msg: string) => void
    onEpisode?: (ep: number) => void
  }) {
    currentResult = useWatchParty({
      art: null,
      selectedEpisode: 0,
      onSelectEpisode: props.onEpisode || vi.fn(),
      showNotice: props.onNotice || vi.fn(),
    })
    return null
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams.delete('partyRoom')
    mockSearchParams.delete('partyMode')
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('初始状态未激活放映室', async () => {
    await act(async () => {
      root.render(createElement(TestHarness))
    })

    expect(currentResult.isPartyActive).toBe(false)
    expect(currentResult.isHost).toBe(false)
    expect(currentResult.roomId).toBeNull()
    expect(currentResult.isSupabaseAvailable).toBe(true)
  })

  it('创建房间生成正确的房间号并建立频道', async () => {
    await act(async () => {
      root.render(createElement(TestHarness))
    })

    let url = ''
    await act(async () => {
      url = currentResult.createParty('host_only')
    })

    expect(currentResult.isPartyActive).toBe(true)
    expect(currentResult.isHost).toBe(true)
    expect(currentResult.mode).toBe('host_only')
    expect(currentResult.roomId).toBeTruthy()
    expect(url).toContain('partyRoom=')
    expect(url).toContain('partyMode=host_only')
    expect(mockSyncClient.channel).toHaveBeenCalled()
    expect(mockChannel.track).toHaveBeenCalled()
  })

  it('房主主控模式下房主可广播播放状态', async () => {
    await act(async () => {
      root.render(createElement(TestHarness))
    })

    await act(async () => {
      currentResult.createParty('host_only')
    })

    await act(async () => {
      currentResult.broadcastAction({
        type: 'play',
        time: 42,
      })
    })

    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'broadcast',
        event: 'party_action',
        payload: expect.objectContaining({
          type: 'play',
          time: 42,
          senderName: 'testuser',
        }),
      }),
    )
  })

  it('退出房间清理频道和状态', async () => {
    await act(async () => {
      root.render(createElement(TestHarness))
    })

    await act(async () => {
      currentResult.createParty('collaborative')
    })

    expect(currentResult.isPartyActive).toBe(true)

    await act(async () => {
      currentResult.leaveParty()
    })

    expect(currentResult.isPartyActive).toBe(false)
    expect(currentResult.roomId).toBeNull()
    expect(mockChannel.unsubscribe).toHaveBeenCalled()
    expect(mockSyncClient.removeChannel).toHaveBeenCalled()
  })

  it('观众加入房间时自动发送 request_state 请求进度握手', async () => {
    mockSearchParams.set('partyRoom', 'room123')
    mockSearchParams.set('partyMode', 'host_only')

    await act(async () => {
      root.render(createElement(TestHarness))
    })

    expect(currentResult.isPartyActive).toBe(true)
    expect(currentResult.isHost).toBe(false)
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'broadcast',
        event: 'party_action',
        payload: expect.objectContaining({
          type: 'request_state',
        }),
      }),
    )
  })
})
