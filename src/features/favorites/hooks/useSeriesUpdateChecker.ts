import { useEffect, useRef } from 'react'
import {
  createCmsClient,
  createDirectStrategy,
  createFetchAdapter,
  createUrlPrefixProxyStrategy,
} from '@ouonnki/cms-core'
import { normalizeProxyPrefix } from '@/shared/config/api.config'
import { useApiStore } from '@/shared/store/apiStore'
import { useAuthStore } from '@/shared/store/authStore'
import { useSettingStore } from '@/shared/store/settingStore'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'
import { useFavoritesStore } from '../store/favoritesStore'
import { useSeriesUpdatesStore } from '../store/seriesUpdatesStore'
import { canTrackFavorite, trackingKey } from '../lib/seriesTracking'
import { checkSeriesUpdates } from '../lib/checkSeriesUpdates'

const CHECK_INTERVAL = 30 * 60 * 1000
const fingerprint = (value: string) =>
  String(
    Array.from(value).reduce(
      (hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0,
      0,
    ),
  )

export function useSeriesUpdateChecker() {
  const ownerId = useAuthStore(state => state.account?.id)
  const favorites = useFavoritesStore(state => state.favorites)
  const sources = useApiStore(state => state.videoAPIs)
  const network = useSettingStore(state => state.network)
  const tmdbEnabled = useSettingStore(state => state.system.tmdbEnabled)
  const refreshToken = useSeriesUpdatesStore(state => state.refreshToken)
  const lastRefresh = useRef(refreshToken)
  // 收藏状态、评分及云同步回写不应中断后台检查。
  const signature = JSON.stringify(
    favorites
      .filter(
        item =>
          item.tracking?.enabled &&
          canTrackFavorite(item) &&
          (tmdbEnabled || item.sourceType === 'cms'),
      )
      .map(item => ({
        id: item.id,
        sourceType: item.sourceType,
        media: item.media,
        tracking: { enabled: item.tracking?.enabled, seasonNumber: item.tracking?.seasonNumber },
      })),
  )
  const sourceSignature = JSON.stringify(sources.filter(source => source.isEnabled))
  const networkSignature = JSON.stringify(network)

  useEffect(() => {
    if (!ownerId) return
    const force = refreshToken !== lastRefresh.current
    lastRefresh.current = refreshToken
    // 缓存只记录配置指纹，不额外保存代理地址或视频源凭据。
    const configuration = fingerprint(sourceSignature + networkSignature)
    const items = useFavoritesStore
      .getState()
      .favorites.filter(
        item =>
          item.tracking?.enabled &&
          canTrackFavorite(item) &&
          (tmdbEnabled || item.sourceType === 'cms'),
      )
    useSeriesUpdatesStore.getState().configure(ownerId, items.map(trackingKey))
    if (!items.length) return

    const controller = new AbortController()
    const adapter = createFetchAdapter()
    const config = useSettingStore.getState().network
    const client = createCmsClient({
      proxyStrategy: config.isProxyEnabled
        ? createUrlPrefixProxyStrategy(normalizeProxyPrefix(config.proxyUrl))
        : createDirectStrategy(),
      requestAdapter: {
        fetch: (url, options) => {
          controller.signal.throwIfAborted()
          return adapter.fetch(url, { ...options, signal: controller.signal })
        },
      },
    })
    // 后台检查不重试；限制单次请求时长，减少对播放与交互的影响。
    const enabledSources = useApiStore
      .getState()
      .videoAPIs.filter(source => source.isEnabled)
      .map(source => ({
        ...source,
        timeout: Math.min(source.timeout || config.defaultTimeout, 10000),
        retry: 0,
      }))
    const run = async () => {
      useSeriesUpdatesStore.setState({ checking: true })
      const queue = [...items]
      const worker = async () => {
        while (queue.length && !controller.signal.aborted) {
          const item = queue.shift()!
          const key = trackingKey(item)
          const previous = useSeriesUpdatesStore.getState().entries[key]
          // 手动刷新总会检查；自动检查在同一轮打开网站时复用最近结果。
          if (
            !force &&
            previous &&
            !previous.error &&
            previous.configuration === configuration &&
            enabledSources.some(source => source.id === previous.sourceCode) &&
            Date.now() - previous.attemptedAt < CHECK_INTERVAL
          )
            continue
          try {
            const result = await checkSeriesUpdates(
              item,
              client,
              enabledSources,
              useViewingHistoryStore.getState().viewingHistory,
              controller.signal,
            )
            const source = enabledSources.find(source => source.id === result.sourceCode)
            const resourceSignature = fingerprint(JSON.stringify([source?.url, source?.detailUrl]))
            if (!controller.signal.aborted && useAuthStore.getState().account?.id === ownerId)
              useSeriesUpdatesStore
                .getState()
                .saveResult(ownerId, key, { ...result, configuration, resourceSignature })
          } catch (error) {
            if (controller.signal.aborted || useAuthStore.getState().account?.id !== ownerId) return
            useSeriesUpdatesStore.getState().saveResult(ownerId, key, {
              ...previous,
              attemptedAt: Date.now(),
              error: error instanceof Error ? error.message : '检查失败，请稍后刷新',
            })
          }
        }
      }
      try {
        await Promise.all([worker(), worker()])
      } finally {
        if (!controller.signal.aborted) useSeriesUpdatesStore.setState({ checking: false })
      }
    }
    // 合并初始化/云同步触发的变更，也避免 StrictMode 重复发起请求。
    const timer = window.setTimeout(() => void run(), 300)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
      client.destroy()
      useSeriesUpdatesStore.setState({ checking: false })
    }
  }, [ownerId, signature, sourceSignature, networkSignature, refreshToken, tmdbEnabled])
}
