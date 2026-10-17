import { beforeEach, describe, expect, it } from 'vitest'
import { useSeriesUpdatesStore } from './seriesUpdatesStore'

describe('追更缓存账号隔离', () => {
  beforeEach(() =>
    useSeriesUpdatesStore.setState({
      ownerId: null,
      entries: {},
      checking: false,
      refreshToken: 0,
    }),
  )

  it('切换账号清除旧结果，旧账号的迟到请求不能写入新账号', () => {
    const store = useSeriesUpdatesStore.getState()
    store.configure('alice', ['a'])
    store.saveResult('alice', 'a', { attemptedAt: 1, checkedAt: 1 })
    store.configure('bob', ['a'])
    store.saveResult('alice', 'a', { attemptedAt: 2, checkedAt: 2 })
    expect(useSeriesUpdatesStore.getState().entries).toEqual({})
  })

  it('取消追更、删除收藏或切换季数后移除旧缓存', () => {
    const store = useSeriesUpdatesStore.getState()
    store.configure('alice', ['a', 'b'])
    store.saveResult('alice', 'a', { attemptedAt: 1 })
    store.saveResult('alice', 'b', { attemptedAt: 1 })
    store.configure('alice', ['b'])
    expect(Object.keys(useSeriesUpdatesStore.getState().entries)).toEqual(['b'])
  })
})
