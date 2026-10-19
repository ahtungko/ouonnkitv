import { Bell, RefreshCw, Play, AlertCircle } from 'lucide-react'
import { NavLink } from 'react-router'
import { Button } from '@/shared/components/ui/button'
import { useFavoritesStore } from '@/features/favorites/store/favoritesStore'
import { useSeriesUpdatesStore } from '@/features/favorites/store/seriesUpdatesStore'
import {
  trackingKey,
  trackingProgress,
  trackingPlayPath,
  canTrackFavorite,
} from '@/features/favorites/lib/seriesTracking'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'
import { useAuthStore } from '@/shared/store/authStore'
import { useApiStore } from '@/shared/store/apiStore'
import { useTmdbEnabled } from '@/shared/hooks/useTmdbMode'
import { getPosterUrl } from '@/shared/lib/tmdb'
import { buildCmsPlayPath, buildTmdbDetailPath } from '@/shared/lib/routes'
import { TrackingProgressControl } from '@/features/favorites/components/TrackingProgressControl'

const formatCheckedAt = (time: number) =>
  new Date(time).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export function SeriesUpdates() {
  const favorites = useFavoritesStore(state => state.favorites)
  const history = useViewingHistoryStore(state => state.viewingHistory)
  const ownerId = useAuthStore(state => state.account?.id)
  const { ownerId: cacheOwner, entries, checking, refresh } = useSeriesUpdatesStore()
  const sources = useApiStore(state => state.videoAPIs)
  const tmdbEnabled = useTmdbEnabled()
  const tracked = favorites.filter(
    item =>
      item.tracking?.enabled &&
      canTrackFavorite(item) &&
      (tmdbEnabled || item.sourceType === 'cms'),
  )
  const rows = tracked
    .map(item => {
      const update = ownerId === cacheOwner ? entries[trackingKey(item)] : undefined
      const progress = trackingProgress(item, update, history)
      const nextIndex = progress.nextEpisode?.index ?? update?.episodes?.[0]?.index ?? 0
      const path =
        update && sources.some(source => source.isEnabled && source.id === update.sourceCode)
          ? trackingPlayPath(item, update, nextIndex)
          : null
      return { item, update, progress, path }
    })
    .sort(
      (a, b) =>
        Number(b.progress.pendingCount > 0) - Number(a.progress.pendingCount > 0) ||
        (b.update?.checkedAt ?? 0) - (a.update?.checkedAt ?? 0),
    )
  const pendingSeries = rows.filter(row => row.progress.pendingCount > 0).length

  if (!rows.length) return null

  return (
    <section aria-label="追剧更新" className="border-border rounded-xl border p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bell className="text-primary size-5" />
          <h2 className="text-primary text-xl font-semibold">追剧更新</h2>
          {pendingSeries > 0 && (
            <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
              {pendingSeries} 部待看
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <NavLink to="/favorites">管理追更</NavLink>
          </Button>
          <Button size="sm" variant="outline" disabled={checking} onClick={refresh}>
            <RefreshCw className={`size-3.5 ${checking ? 'animate-spin' : ''}`} />
            {checking ? '检查中…' : '检查更新'}
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        打开网站时检查视频源更新；待看集数按观看进度估算，当前未看完的一集也计入。
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">
        {rows.map(({ item, update, progress, path }) => {
          const title = item.sourceType === 'tmdb' ? item.media.title : item.media.vodName
          const detailPath =
            item.sourceType === 'tmdb'
              ? buildTmdbDetailPath('tv', item.media.id)
              : buildCmsPlayPath(item.media.sourceCode, item.media.vodId)
          const poster =
            item.sourceType === 'tmdb'
              ? getPosterUrl(item.media.posterPath, 'w342')
              : item.media.vodPic
          return (
            <article key={item.id} className="bg-muted/30 flex gap-3 rounded-lg p-3">
              <NavLink
                to={detailPath}
                aria-label={`打开${title}`}
                className="focus-visible:ring-ring block h-28 w-[4.5rem] shrink-0 overflow-hidden rounded-md outline-none focus-visible:ring-2"
              >
                {poster ? (
                  <img src={poster} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  <div className="bg-muted text-muted-foreground flex size-full items-center justify-center">
                    <Bell className="size-6" />
                  </div>
                )}
              </NavLink>
              <div className="min-w-0 flex-1 space-y-1.5">
                <h3 className="line-clamp-1 text-sm font-semibold" title={title}>
                  <NavLink to={detailPath} className="hover:underline focus-visible:underline">
                    {title}
                  </NavLink>
                </h3>
                {item.sourceType === 'tmdb' && (
                  <p className="text-muted-foreground text-xs">
                    第 {item.tracking?.seasonNumber ?? 1} 季
                  </p>
                )}
                {update?.checkedAt ? (
                  <>
                    <p className="text-xs">
                      更新至第 {progress.latestEpisode} 集
                      {progress.pendingCount > 0 ? (
                        <span className="text-primary ml-2 font-medium">
                          {progress.pendingCount} 集待看
                        </span>
                      ) : (
                        <span className="text-muted-foreground ml-2">已追平</span>
                      )}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {progress.currentEpisode
                        ? `看到第 ${progress.currentEpisode} 集`
                        : '尚未观看'}{' '}
                      · {update.sourceName}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      上次成功检查 {formatCheckedAt(update.checkedAt)}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    {checking ? '正在检查视频源…' : '尚无检查结果'}
                  </p>
                )}
                {update?.error && (
                  <p className="text-xs text-amber-600 dark:text-amber-400" role="status">
                    <AlertCircle className="mr-1 inline size-3" />
                    {update.error}
                    {update.checkedAt ? '（显示上次成功结果）' : ''}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {path && (
                    <Button asChild size="sm" variant="secondary" className="h-7 text-xs">
                      <NavLink to={path}>
                        <Play className="size-3" />
                        {!progress.pendingCount
                          ? '重新观看'
                          : progress.currentEpisode
                            ? '继续观看'
                            : '开始观看'}
                      </NavLink>
                    </Button>
                  )}
                  <TrackingProgressControl item={item} update={update} />
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
