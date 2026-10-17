import { Bell, BellOff } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'
import { useAuthStore } from '@/shared/store/authStore'
import { useFavoritesStore } from '../store/favoritesStore'
import { useSeriesUpdatesStore } from '../store/seriesUpdatesStore'
import type { FavoriteItem } from '../types/favorites'
import { canTrackFavorite, trackingKey, trackingProgress } from '../lib/seriesTracking'

const SEASON_OPTIONS = Array.from({ length: 99 }, (_, index) => index + 1)

export function TrackingControl({ item }: { item: FavoriteItem }) {
  const setTracking = useFavoritesStore(state => state.setTracking)
  const ownerId = useAuthStore(state => state.account?.id)
  const update = useSeriesUpdatesStore(state =>
    state.ownerId === ownerId ? state.entries[trackingKey(item)] : undefined,
  )
  const history = useViewingHistoryStore(state => state.viewingHistory)
  if (!canTrackFavorite(item)) return null
  const enabled = item.tracking?.enabled ?? false
  const { pendingCount, latestEpisode } = trackingProgress(item, update, history)
  return (
    <div className="mt-2 space-y-1.5">
      <Button
        variant={enabled ? 'secondary' : 'outline'}
        size="sm"
        className="h-8 w-full gap-1 text-xs"
        aria-pressed={enabled}
        aria-label={`${enabled ? '取消' : '开启'}追更：${item.sourceType === 'tmdb' ? item.media.title : item.media.vodName}`}
        onClick={() => {
          const latest =
            item.sourceType === 'tmdb'
              ? history
                  .filter(
                    record =>
                      record.recordType === 'tmdb' &&
                      record.tmdbId === item.media.id &&
                      record.tmdbMediaType === 'tv' &&
                      (record.tmdbSeasonNumber ?? 1) > 0 &&
                      (record.tmdbSeasonNumber ?? 1) <= 99,
                  )
                  .sort((a, b) => b.timestamp - a.timestamp)[0]
              : undefined
          setTracking(item.id, {
            enabled: !enabled,
            ...(item.sourceType === 'tmdb'
              ? { seasonNumber: item.tracking?.seasonNumber ?? latest?.tmdbSeasonNumber ?? 1 }
              : {}),
          })
        }}
      >
        {enabled ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
        {enabled ? '追更中' : '开启追更'}
        {enabled && pendingCount > 0 && (
          <span className="bg-primary text-primary-foreground ml-auto rounded-full px-1.5 text-[10px]">
            {pendingCount} 集待看
          </span>
        )}
      </Button>
      {enabled && item.sourceType === 'tmdb' && (
        <label className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
          追更第
          <select
            className="bg-background border-border text-foreground h-7 rounded border px-1"
            aria-label={`${item.media.title}追更季数`}
            value={item.tracking?.seasonNumber ?? 1}
            onChange={event =>
              setTracking(item.id, { enabled: true, seasonNumber: Number(event.target.value) })
            }
          >
            {SEASON_OPTIONS.map(season => (
              <option key={season} value={season}>
                {season}
              </option>
            ))}
          </select>
          季
        </label>
      )}
      {enabled && (
        <p className="text-muted-foreground text-center text-[11px]" title={update?.error}>
          {update?.error
            ? '检查未完成，首页查看详情'
            : latestEpisode
              ? `更新至第 ${latestEpisode} 集`
              : '等待检查更新'}
        </p>
      )}
    </div>
  )
}
