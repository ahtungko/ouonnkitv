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
    applyJournal({ favorite: { ...row, pending: false } })
    expect(useFavoritesStore.getState().favorites[0].tracking).toEqual({ enabled: true, seasonNumber: 2 })
    expect(validPayload({ ...row, value: { ...row.value, tracking: { enabled: true, seasonNumber: 0 } } })).toBe(false)
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
})
