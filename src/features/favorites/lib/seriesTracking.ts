import type { DetailResult } from '@ouonnki/cms-core'
import type { FavoriteItem } from '../types/favorites'
import type { ViewingHistoryItem } from '@/shared/types/video'
import { buildCmsPlayPath, buildTmdbPlayPath } from '@/shared/lib/routes'

export interface TrackedEpisode {
  index: number
  number: number
}

export interface SeriesUpdate {
  configuration?: string
  checkedAt?: number
  attemptedAt: number
  sourceCode?: string
  sourceName?: string
  vodId?: string
  episodes?: TrackedEpisode[]
  error?: string
}

export function canTrackFavorite(item: FavoriteItem): boolean {
  // CMS 类型并不统一，允许用户主动追踪剧集、动漫或综艺。
  return item.sourceType === 'cms' || item.media.mediaType === 'tv'
}

export function trackingKey(item: FavoriteItem): string {
  return `${item.id}::${item.sourceType === 'tmdb' ? (item.tracking?.seasonNumber ?? 1) : 'cms'}`
}

export function episodeNumber(name: string | undefined): number | null {
  if (!name || /预告|花絮|特辑|特典|彩蛋|解说|片段|trailer|special|preview/i.test(name)) return null
  const match =
    name.trim().match(/^(?:第\s*)?0*(\d+)\s*(?:集|话|話|期|$)/i) ||
    name.trim().match(/^(?:EP?|Episode)\s*0*(\d+)(?:\b|$)/i)
  const number = match ? Number(match[1]) : 0
  return number > 0 && number < 10000 ? number : null
}

/** 只统计详情中带播放地址的正片，不使用 TMDB 计划集数或“更新至”文案。 */
export function playableEpisodes(detail: DetailResult): TrackedEpisode[] {
  const episodes: TrackedEpisode[] = []
  const seen = new Set<number>()
  detail.episodes.forEach((url, index) => {
    if (!/^https?:\/\//i.test(url)) return
    const name = detail.videoInfo?.episodes_names?.[index]
    if (name && /预告|花絮|特辑|特典|彩蛋|解说|片段|trailer|special|preview/i.test(name)) return
    const number = episodeNumber(name) ?? episodes.length + 1
    if (seen.has(number)) return
    seen.add(number)
    episodes.push({ index, number })
  })
  return episodes.sort((a, b) => a.number - b.number)
}

export function favoriteHistory(item: FavoriteItem, history: ViewingHistoryItem[]) {
  return history.filter(record => {
    if (item.sourceType === 'cms') {
      return record.sourceCode === item.media.sourceCode && record.vodId === item.media.vodId
    }
    return (
      record.recordType === 'tmdb' &&
      record.tmdbMediaType === 'tv' &&
      record.tmdbId === item.media.id &&
      (record.tmdbSeasonNumber ?? 1) === (item.tracking?.seasonNumber ?? 1)
    )
  })
}

export function trackingProgress(
  item: FavoriteItem,
  update: SeriesUpdate | undefined,
  history: ViewingHistoryItem[],
) {
  const episodes = update?.episodes ?? []
  let completedThrough = 0
  let currentEpisode = 0
  for (const record of favoriteHistory(item, history)) {
    if (record.playbackPosition <= 0 || record.duration <= 0) continue
    const samePlaylist = record.sourceCode === update?.sourceCode && record.vodId === update?.vodId
    const number =
      episodeNumber(record.episodeName) ??
      (samePlaylist ? episodes.find(ep => ep.index === record.episodeIndex)?.number : undefined)
    if (!number) continue
    currentEpisode = Math.max(currentEpisode, number)
    // 正在播放的一集仍计入待看，避免自动跳到下一集后提前消除提醒。
    const completed = record.playbackPosition / record.duration >= 0.9
    completedThrough = Math.max(completedThrough, completed ? number : number - 1)
  }
  const pending = episodes.filter(ep => ep.number > completedThrough)
  return {
    currentEpisode,
    pendingCount: pending.length,
    nextEpisode: pending[0],
    latestEpisode: episodes[episodes.length - 1]?.number ?? 0,
  }
}

export function trackingPlayPath(
  item: FavoriteItem,
  update: SeriesUpdate,
  index: number,
): string | null {
  if (!update.sourceCode || !update.vodId) return null
  return item.sourceType === 'cms'
    ? buildCmsPlayPath(update.sourceCode, update.vodId, index)
    : buildTmdbPlayPath('tv', item.media.id, {
        sourceCode: update.sourceCode,
        vodId: update.vodId,
        episodeIndex: index,
        seasonNumber: item.tracking?.seasonNumber ?? 1,
      })
}
