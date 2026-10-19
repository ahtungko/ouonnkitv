import { beforeEach, describe, expect, it } from 'vitest'
import { useSeriesNotificationsStore, syncedNotificationView } from './seriesNotificationsStore'
import {
  notificationIdentity,
  notificationNeedsSync,
  notificationView,
  mergeNotificationAccounts,
  type RemoteSeriesNotification,
} from '../lib/seriesNotificationSync'
import type { SeriesUpdate } from '../lib/seriesTracking'

const update = (numbers: number[], unread: number[] = []): SeriesUpdate => ({
  attemptedAt: 1,
  checkedAt: 1,
  sourceCode: 'source',
  vodId: 'video',
  resourceSignature: 'hash',
  episodes: numbers.map((number, index) => ({ index, number })),
  notification: { knownEpisodes: numbers, unreadEpisodes: unread },
})
const key = 'favorite::1'
const resource = notificationIdentity(key, update([1]))!
const remote = (knownEpisodes: number[], readEpisodes: number[]): RemoteSeriesNotification => ({
  ...resource,
  knownEpisodes,
  readEpisodes,
})
const local = () => useSeriesNotificationsStore.getState().accounts.alice[resource.resourceKey]
beforeEach(() => {
  localStorage.clear()
  useSeriesNotificationsStore.setState({
    accounts: {},
    syncOwner: null,
    status: '未同步',
    error: null,
  })
})

describe('跨设备提醒收据', () => {
  it('首次迁移保留本机已有未读，第一次普通检查建立已读基准', () => {
    const store = useSeriesNotificationsStore.getState()
    expect(store.observe('alice', key, update([1, 2, 3], [3]))?.unreadEpisodes).toEqual([3])
    expect(local().baselineEpisodes).toEqual([1, 2])
    expect(notificationNeedsSync(local())).toBe(true)
    expect(store.observe('bob', key, update([1, 2, 3]))?.unreadEpisodes).toEqual([])
  })

  it('新设备的隐式基准不能清空云端未读，已读收据以云端为准', () => {
    const store = useSeriesNotificationsStore.getState()
    store.observe('alice', key, update([1, 2, 3, 4]))
    expect(notificationView(local()).unreadEpisodes).toEqual([])
    store.applyRemote('alice', [remote([1, 2, 3, 4], [1, 2])])
    expect(syncedNotificationView('alice', key, update([1, 2, 3, 4]))?.unreadEpisodes).toEqual([
      3, 4,
    ])
    expect(notificationNeedsSync(local())).toBe(false)
  })

  it('上传期间继续到达的新集和新已读不能被旧响应确认掉', () => {
    const store = useSeriesNotificationsStore.getState()
    store.observe('alice', key, update([1, 2]))
    store.applyRemote('alice', [remote([1, 2, 3], [1, 2])])
    store.observe('alice', key, update([1, 2, 3, 4], [3, 4]))
    store.markRead('alice', key, update([1, 2, 3, 4], [3, 4]), [3])
    store.applyRemote('alice', [remote([1, 2, 3], [1, 2])])
    expect(notificationView(local()).unreadEpisodes).toEqual([4])
    expect(notificationNeedsSync(local())).toBe(true)
    store.applyRemote('alice', [remote([1, 2, 3, 4], [1, 2, 3])])
    expect(notificationNeedsSync(local())).toBe(false)
    expect(notificationView(local()).unreadEpisodes).toEqual([4])
  })

  it('离线已读在刷新后保留，旧设备响应不能让已读提醒复活', async () => {
    const store = useSeriesNotificationsStore.getState()
    store.observe('alice', key, update([1, 2]))
    store.applyRemote('alice', [remote([1, 2, 3], [1, 2])])
    store.markRead('alice', key, update([1, 2, 3], [3]), [3])
    useSeriesNotificationsStore.setState({ accounts: {} })
    await useSeriesNotificationsStore.persist.rehydrate()
    expect(notificationView(local()).unreadEpisodes).toEqual([])
    expect(notificationNeedsSync(local())).toBe(true)
    store.applyRemote('alice', [remote([1, 2, 3, 4], [1, 2])])
    expect(notificationView(local()).unreadEpisodes).toEqual([4])
  })

  it('账号、季数、源和配置指纹分别隔离，旧资源收据不应用到新资源', () => {
    const store = useSeriesNotificationsStore.getState()
    store.observe('alice', key, update([1, 2, 3], [3]))
    store.markRead('alice', key, update([1, 2, 3], [3]), [3])
    for (const other of [
      { ...update([1, 2, 3], [3]), bindingKey: 'fixed' },
      { ...update([1, 2, 3], [3]), resourceSignature: 'other' },
      { ...update([1, 2, 3], [3]), vodId: 'other' },
    ])
      expect(store.observe('alice', key, other)?.unreadEpisodes).toEqual([3])
    expect(store.observe('alice', 'favorite::2', update([1, 2, 3], [3]))?.unreadEpisodes).toEqual([
      3,
    ])
    expect(store.observe('bob', key, update([1, 2, 3], [3]))?.unreadEpisodes).toEqual([3])
  })

  it('跨标签页合并收据与服务端确认，既不丢离线已读也不重新排队已确认内容', () => {
    const store = useSeriesNotificationsStore.getState()
    store.observe('alice', key, update([1, 2]))
    store.applyRemote('alice', [remote([1, 2, 3, 4], [1, 2])])
    const tabA = structuredClone(useSeriesNotificationsStore.getState().accounts)
    store.markRead('alice', key, update([1, 2, 3, 4], [3, 4]), [3])
    const tabB = structuredClone(useSeriesNotificationsStore.getState().accounts)
    const merged = mergeNotificationAccounts(tabA, tabB)
    expect(notificationView(merged.alice[resource.resourceKey]).unreadEpisodes).toEqual([4])
    store.applyRemote('alice', [remote([1, 2, 3, 4], [1, 2, 3])])
    const confirmed = mergeNotificationAccounts(
      tabB,
      useSeriesNotificationsStore.getState().accounts,
    )
    expect(notificationNeedsSync(confirmed.alice[resource.resourceKey])).toBe(false)
  })
})
