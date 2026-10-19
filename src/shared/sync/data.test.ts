import { describe, expect, it } from 'vitest'
import { applyJournal, validPayload } from './data'
import { useFavoritesStore } from '@/features/favorites/store/favoritesStore'

describe('cloud payload compatibility', () => {
  it('追更开关与季数可以跨设备同步，检查结果不混入收藏', () => {
    const row = {
      kind: 'favorite' as const, item_key: 'cms_x', modified_at: 1, mutation_id: 'b', deleted: false,
      value: { id: 'cms_x', addedAt: 1, updatedAt: 1, sourceType: 'cms', watchStatus: 'watching',
        tags: [], tracking: { enabled: true, seasonNumber: 2 },
        media: { vodId: 'x', vodName: 'X', sourceCode: 's', sourceName: 'S' } },
    }
    expect(validPayload(row)).toBe(true)
    expect(validPayload({ ...row, value: { ...row.value, tracking: { enabled: true, seasonNumber: 100 } } })).toBe(true)
    applyJournal({ favorite: { ...row, pending: false } })
    expect(useFavoritesStore.getState().favorites[0].tracking).toEqual({ enabled: true, seasonNumber: 2 })
    expect(validPayload({ ...row, value: { ...row.value, tracking: { enabled: true, seasonNumber: 0 } } })).toBe(false)
  })
  it('按季校准随收藏同步，兼容旧收藏并校验非法进度', () => {
    const row = {
      kind: 'favorite' as const, item_key: 'tmdb_tv_1', modified_at: 1, mutation_id: 'c', deleted: false,
      value: { id: 'tmdb_tv_1', addedAt: 1, updatedAt: 1, sourceType: 'tmdb', watchStatus: 'watching', tags: [],
        tracking: { enabled: true, seasonNumber: 2, progress: {
          '1': { completedEpisode: 12, calibratedAt: 100 }, '2': { completedEpisode: 0, calibratedAt: 200 },
        } }, media: { id: 1, mediaType: 'tv', title: '剧', originalTitle: 'Show', posterPath: null,
          backdropPath: null, releaseDate: '2024', voteAverage: 8 } },
    }
    expect(validPayload(row)).toBe(true)
    applyJournal({ favorite: { ...row, pending: false } })
    expect(useFavoritesStore.getState().favorites[0].tracking?.progress).toEqual(row.value.tracking.progress)
    for (const progress of [{ '2': { completedEpisode: -1, calibratedAt: 1 } },
      { '2': { completedEpisode: 1.5, calibratedAt: 1 } }, { '0': { completedEpisode: 1, calibratedAt: 1 } }]) {
      expect(validPayload({ ...row, value: { ...row.value, tracking: { ...row.value.tracking, progress } } })).toBe(false)
    }
  })
  it('accepts nullable legacy favorite fields', () => {
    expect(
      validPayload({
        kind: 'favorite',
        item_key: 'cms_x',
        modified_at: 1,
        mutation_id: 'a',
        deleted: false,
        value: {
          id: 'cms_x',
          addedAt: 1,
          updatedAt: 1,
          sourceType: 'cms',
          watchStatus: 'watching',
          notes: null,
          rating: null,
          tags: [],
          media: { vodId: 'x', vodName: 'X', sourceCode: 's', sourceName: 'S', vodPic: null },
        },
      }),
    ).toBe(true)
  })
  it('追更绑定按季同步，资源地址不能充当视频ID', () => {
    const binding = { sourceCode: '源1', sourceName: '源名称', vodId: 'video-1', title: '手动绑定的剧' }
    const row = { kind: 'favorite' as const, item_key: 'cms_x', modified_at: 1, mutation_id: 'binding', deleted: false,
      value: { id: 'cms_x', addedAt: 1, updatedAt: 1, sourceType: 'cms', watchStatus: 'watching', tags: [],
        tracking: { enabled: true, bindings: { cms: binding } },
        media: { vodId: 'x', vodName: 'X', sourceCode: 's', sourceName: 'S' } } }
    expect(validPayload(row)).toBe(true)
    applyJournal({ favorite: { ...row, pending: false } })
    expect(useFavoritesStore.getState().favorites[0].tracking?.bindings?.cms).toEqual(binding)
    expect(validPayload({ ...row, value: { ...row.value, tracking: { enabled: true, bindings: { cms: { ...binding, vodId: 'https://x/v' } } } } })).toBe(false)
    expect(validPayload({ ...row, value: { ...row.value, tracking: { enabled: true, bindings: { '0': binding } } } })).toBe(false)
  })
})
