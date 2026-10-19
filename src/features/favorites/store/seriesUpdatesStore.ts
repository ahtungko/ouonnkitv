import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mergeSeriesUpdate, unreadEpisodeNumbers, type SeriesUpdate } from '../lib/seriesTracking'

interface SeriesUpdatesStore {
  ownerId: string | null
  entries: Record<string, SeriesUpdate>
  checking: boolean
  refreshToken: number
  configure: (ownerId: string, keys: string[]) => void
  saveResult: (ownerId: string, key: string, result: SeriesUpdate) => void
  markRead: (ownerId: string, key: string, displayedUpdate: SeriesUpdate) => void
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
          state.ownerId === ownerId
            ? {
                entries: { ...state.entries, [key]: mergeSeriesUpdate(state.entries[key], result) },
              }
            : state,
        ),
      markRead: (ownerId, key, displayedUpdate) =>
        set(state => {
          const current = state.entries[key]
          if (
            state.ownerId !== ownerId ||
            !current?.notification ||
            current.sourceCode !== displayedUpdate.sourceCode ||
            current.vodId !== displayedUpdate.vodId ||
            (current.bindingKey ?? 'auto') !== (displayedUpdate.bindingKey ?? 'auto') ||
            current.resourceSignature !== displayedUpdate.resourceSignature
          )
            return state
          // 只确认按钮显示时已看到的提醒，并保留点击前刚到达的新集。
          const read = new Set(unreadEpisodeNumbers(displayedUpdate))
          return {
            entries: {
              ...state.entries,
              [key]: {
                ...current,
                notification: {
                  ...current.notification,
                  unreadEpisodes: current.notification.unreadEpisodes.filter(
                    number => !read.has(number),
                  ),
                },
              },
            },
          }
        }),
      refresh: () => set(state => ({ refreshToken: state.refreshToken + 1 })),
    }),
    {
      name: 'ouonnki-tv-series-updates',
      partialize: state => ({ ownerId: state.ownerId, entries: state.entries }),
    },
  ),
)
