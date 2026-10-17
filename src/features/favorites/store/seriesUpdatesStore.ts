import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SeriesUpdate } from '../lib/seriesTracking'

interface SeriesUpdatesStore {
  ownerId: string | null
  entries: Record<string, SeriesUpdate>
  checking: boolean
  refreshToken: number
  configure: (ownerId: string, keys: string[]) => void
  saveResult: (ownerId: string, key: string, result: SeriesUpdate) => void
  refresh: () => void
}

export const useSeriesUpdatesStore = create<SeriesUpdatesStore>()(
  persist(
    set => ({
      ownerId: null,
      entries: {},
      checking: false,
      refreshToken: 0,
      configure: (ownerId, keys) =>
        set(state => ({
          ownerId,
          entries:
            state.ownerId === ownerId
              ? Object.fromEntries(
                  Object.entries(state.entries).filter(([key]) => keys.includes(key)),
                )
              : {},
        })),
      saveResult: (ownerId, key, result) =>
        set(state =>
          state.ownerId === ownerId ? { entries: { ...state.entries, [key]: result } } : state,
        ),
      refresh: () => set(state => ({ refreshToken: state.refreshToken + 1 })),
    }),
    {
      name: 'ouonnki-tv-series-updates',
      partialize: state => ({ ownerId: state.ownerId, entries: state.entries }),
    },
  ),
)
