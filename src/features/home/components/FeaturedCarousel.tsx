import { useEffect, useMemo, useState } from 'react'
import { MoreHorizontal, Play, Info, ChevronLeft, ChevronRight, Star } from 'lucide-react'
import Autoplay from 'embla-carousel-autoplay'
import { NavLink, useNavigate } from 'react-router'

import { getBackdropUrl, getLogoUrl } from '@/shared/lib/tmdb'
import { buildTmdbDetailPath, buildTmdbPlayPath } from '@/shared/lib/routes'
import { buildHistoryPlayPath, isTmdbHistoryItem } from '@/shared/lib/viewingHistory'
import { Button } from '@/shared/components/ui/button'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/shared/components/ui/carousel'
import { AspectRatio } from '@/shared/components/ui/aspect-ratio'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { useIsMobile } from '@/shared/hooks/use-mobile'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'
import type { TmdbMediaItem } from '@/shared/types/tmdb'
import type { ViewingHistoryItem } from '@/shared/types/video'

// 平板断点 (768px - 1024px)
const TABLET_BREAKPOINT = 1024

function useIsTablet() {
  const [isTablet, setIsTablet] = useState<boolean>(false)

  useEffect(() => {
    const checkTablet = () => {
      const width = window.innerWidth
      setIsTablet(width >= 768 && width < TABLET_BREAKPOINT)
    }

    checkTablet()
    window.addEventListener('resize', checkTablet)
    return () => window.removeEventListener('resize', checkTablet)
  }, [])

  return isTablet
}

interface FeaturedCarouselProps {
  items: TmdbMediaItem[]
  loading?: boolean
  autoplayDelay?: number
}

/**
 * FeaturedCarousel - 院线级巨幕全景轮播图 (Cinema Obsidian Hero Banner)
 */
export function FeaturedCarousel({
  items,
  loading = false,
  autoplayDelay = 5500,
}: FeaturedCarouselProps) {
  const navigate = useNavigate()
  const [api, setApi] = useState<CarouselApi>()
  const [activeIndex, setActiveIndex] = useState(0)
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const viewingHistory = useViewingHistoryStore(state => state.viewingHistory)

  const latestTmdbHistoryMap = useMemo(() => {
    const latestHistoryMap = new Map<string, ViewingHistoryItem>()
    const latestMappedHistoryMap = new Map<string, ViewingHistoryItem>()

    viewingHistory.forEach(historyItem => {
      if (!isTmdbHistoryItem(historyItem)) return

      const mediaKey = `${historyItem.tmdbMediaType}-${historyItem.tmdbId}`
      const latestHistory = latestHistoryMap.get(mediaKey)
      const latestMappedHistory = latestMappedHistoryMap.get(mediaKey)

      if (!latestHistory || historyItem.timestamp > latestHistory.timestamp) {
        latestHistoryMap.set(mediaKey, historyItem)
      }

      if (!historyItem.sourceCode || !historyItem.vodId) return

      if (!latestMappedHistory || historyItem.timestamp > latestMappedHistory.timestamp) {
        latestMappedHistoryMap.set(mediaKey, historyItem)
      }
    })

    const resultMap = new Map<string, ViewingHistoryItem>()
    latestHistoryMap.forEach((historyItem, mediaKey) => {
      resultMap.set(mediaKey, latestMappedHistoryMap.get(mediaKey) || historyItem)
    })
    return resultMap
  }, [viewingHistory])

  // 根据设备类型获取 AspectRatio
  // 移动端: 16/10, 平板: 16/9, 桌面: 21/9 院线超宽巨幕
  const getAspectRatio = () => {
    if (isMobile) return 16 / 10
    if (isTablet) return 16 / 9
    return 21 / 9
  }

  // 监听 carousel 选择变化
  useEffect(() => {
    if (!api) return

    const onSelect = () => {
      setActiveIndex(api.selectedScrollSnap())
    }

    onSelect()
    api.on('select', onSelect)
    return () => {
      api.off('select', onSelect)
    }
  }, [api])

  // 骨架屏
  if (loading) {
    return (
      <div className="-mx-3 -mt-3 sm:-mx-6 sm:-mt-5 lg:-mx-8">
        <AspectRatio ratio={getAspectRatio()} className="relative overflow-hidden bg-card/60">
          <Skeleton className="size-full rounded-none" />
          {/* 骨架屏遮罩 */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 px-6 pb-8 md:px-12 md:pb-12 lg:px-16 lg:pb-16">
            <div className="flex gap-2 mb-3">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
            <Skeleton className="mb-4 h-10 w-64 md:h-14 md:w-96" />
            <Skeleton className="mb-2 h-4 w-2/3 max-w-xl" />
            <Skeleton className="mb-6 h-4 w-1/2 max-w-md" />
            <div className="flex gap-3">
              <Skeleton className="h-10 w-28 rounded-full" />
              <Skeleton className="h-10 w-28 rounded-full" />
            </div>
          </div>
        </AspectRatio>
      </div>
    )
  }

  if (items.length === 0) {
    return null
  }

  return (
    <div className="group/hero relative -mx-3 -mt-3 select-none sm:-mx-6 sm:-mt-5 lg:-mx-8">
      <Carousel
        className="relative w-full overflow-hidden"
        opts={{
          align: 'start',
          loop: true,
        }}
        plugins={[
          Autoplay({
            delay: autoplayDelay,
            stopOnInteraction: false,
            stopOnMouseEnter: true,
          }),
        ]}
        setApi={setApi}
      >
        <CarouselContent className="ml-0">
          {items.map((item, index) => {
            const isActive = index === activeIndex
            const playPath = buildTmdbPlayPath(item.mediaType, item.id)
            const detailPath = buildTmdbDetailPath(item.mediaType, item.id)
            const latestTmdbHistory = latestTmdbHistoryMap.get(`${item.mediaType}-${item.id}`)
            const continueWatchingLabel = latestTmdbHistory
              ? latestTmdbHistory.episodeName || `第${latestTmdbHistory.episodeIndex + 1}集`
              : ''
            const continueWatchingProgressLabel = latestTmdbHistory
              ? latestTmdbHistory.duration > 0
                ? `已看 ${Math.round(
                    Math.min(
                      100,
                      Math.max(
                        0,
                        (latestTmdbHistory.playbackPosition / latestTmdbHistory.duration) * 100,
                      ),
                    ),
                  )}%`
                : '已看'
              : ''
            const continueWatchingPath = latestTmdbHistory
              ? latestTmdbHistory.sourceCode && latestTmdbHistory.vodId
                ? buildHistoryPlayPath(latestTmdbHistory)
                : buildTmdbPlayPath(item.mediaType, item.id, {
                    episodeIndex: latestTmdbHistory.episodeIndex,
                    seasonNumber:
                      item.mediaType === 'tv'
                        ? latestTmdbHistory.tmdbSeasonNumber ?? undefined
                        : undefined,
                  })
              : ''
            const playNowLabel = continueWatchingPath ? '从头播放' : '立即播放'
            const releaseYear = item.releaseDate ? item.releaseDate.split('-')[0] : null
            const typeLabel = item.mediaType === 'movie' ? '电影' : '剧集'
            const ratingScore = item.voteAverage > 0 ? item.voteAverage.toFixed(1) : null

            return (
              <CarouselItem
                key={`${item.mediaType}-${item.id}`}
                className="relative pl-0 w-full shrink-0"
              >
                <AspectRatio ratio={getAspectRatio()} className="relative overflow-hidden bg-muted">
                  {/* 背景海报大图 */}
                  <img
                    className="size-full object-cover object-center md:object-top transition-transform duration-1000 ease-out"
                    src={getBackdropUrl(item.backdropPath)}
                    alt={item.title}
                    loading={index === 0 ? 'eager' : 'lazy'}
                  />

                  {/* 电影级多重渐变遮罩 (Cinema Obsidian Masks) */}
                  {/* 1. 顶部微弱压暗 */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background/60 to-transparent" />

                  {/* 2. 左侧深层渐变 (确保标题与介绍文字极致清晰) */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/85 via-40% to-transparent lg:via-background/70 lg:via-45%" />

                  {/* 3. 底部平滑溶解渐变 (无缝融入页面背景) */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background via-background/70 via-40% to-transparent" />

                  {/* 内容展示区 */}
                  <div
                    className={`absolute inset-0 flex flex-col justify-end px-5 pb-6 transition-all duration-700 ease-out sm:px-8 sm:pb-8 md:px-12 md:pb-10 lg:px-16 lg:pb-14 ${
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                    }`}
                  >
                    {/* 元数据标签徽章 */}
                    <div className="mb-2.5 flex flex-wrap items-center gap-2 md:mb-3.5">
                      <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-white/90 backdrop-blur-md">
                        {typeLabel}
                      </span>
                      {releaseYear && (
                        <span className="text-xs font-medium text-white/75">{releaseYear}</span>
                      )}
                      {ratingScore && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-bold text-amber-400 backdrop-blur-md">
                          <Star className="size-3 fill-amber-400 text-amber-400" />
                          {ratingScore}
                        </span>
                      )}
                    </div>

                    {/* Logo 图片或主标题 */}
                    <div className="mb-3 flex items-end md:mb-4">
                      {item.logoPath ? (
                        <img
                          src={getLogoUrl(item.logoPath)}
                          alt={item.title}
                          className="max-h-12 max-w-[200px] object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)] sm:max-h-16 sm:max-w-[260px] md:max-h-24 md:max-w-md lg:max-h-28 lg:max-w-lg"
                        />
                      ) : (
                        <h1 className="text-2xl font-black tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-3xl md:text-5xl lg:text-6xl">
                          {item.title}
                        </h1>
                      )}
                    </div>

                    {/* 故事梗概 */}
                    <p className="mb-5 line-clamp-2 max-w-md text-xs leading-relaxed text-white/80 drop-shadow-sm sm:text-sm md:line-clamp-3 md:max-w-xl md:text-base lg:max-w-2xl">
                      {item.overview}
                    </p>

                    {/* 交互按钮栏 */}
                    <div className="flex items-center gap-2.5 sm:gap-3.5">
                      {isMobile ? (
                        <>
                          <Button
                            size="sm"
                            className="h-9 flex-1 gap-1.5 rounded-full bg-white font-semibold text-black shadow-lg shadow-black/25 transition-all hover:bg-white/90 active:scale-95"
                            onClick={() => navigate(continueWatchingPath || playPath)}
                          >
                            <Play className="size-4 fill-current" />
                            <span>{continueWatchingPath ? '继续观看' : playNowLabel}</span>
                          </Button>

                          {continueWatchingPath ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-9 shrink-0 gap-1 rounded-full border border-white/20 bg-white/15 px-3 text-xs font-semibold text-white backdrop-blur-md hover:bg-white/25 active:scale-95"
                                >
                                  <MoreHorizontal className="size-4" />
                                  <span>更多</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-36">
                                <DropdownMenuItem onClick={() => navigate(playPath)}>
                                  <Play className="size-3.5" />
                                  <span>{playNowLabel}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(detailPath)}>
                                  <Info className="size-3.5" />
                                  <span>查看详情</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-9 shrink-0 gap-1 rounded-full border border-white/20 bg-white/15 px-3.5 text-xs font-semibold text-white backdrop-blur-md hover:bg-white/25 active:scale-95"
                              onClick={() => navigate(detailPath)}
                            >
                              <Info className="size-4" />
                              <span>详情</span>
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          {continueWatchingPath ? (
                            <Button
                              asChild
                              size="lg"
                              className="group relative h-11 gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:brightness-110 active:scale-98"
                            >
                              <NavLink to={continueWatchingPath} className="relative inline-flex items-center">
                                <Play className="size-4.5 fill-current" />
                                <span>继续观看</span>
                                {continueWatchingLabel ? (
                                  <span className="opacity-90">· {continueWatchingLabel}</span>
                                ) : null}
                                {continueWatchingProgressLabel ? (
                                  <span className="ml-1.5 rounded bg-black/30 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                    {continueWatchingProgressLabel}
                                  </span>
                                ) : null}
                              </NavLink>
                            </Button>
                          ) : null}

                          <Button
                            asChild
                            size="lg"
                            className="h-11 gap-2 rounded-full bg-white px-6 font-semibold text-black shadow-xl shadow-black/30 transition-all hover:bg-white/90 hover:scale-[1.02] active:scale-98"
                          >
                            <NavLink to={playPath}>
                              <Play className="size-4.5 fill-current" />
                              <span>{playNowLabel}</span>
                            </NavLink>
                          </Button>

                          <Button
                            asChild
                            size="lg"
                            variant="secondary"
                            className="h-11 gap-2 rounded-full border border-white/20 bg-white/15 px-6 font-semibold text-white backdrop-blur-md transition-all hover:bg-white/25 hover:border-white/35 active:scale-98"
                          >
                            <NavLink to={detailPath}>
                              <Info className="size-4.5" />
                              <span>查看详情</span>
                            </NavLink>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </AspectRatio>
              </CarouselItem>
            )
          })}
        </CarouselContent>

        {/* 桌面端悬浮翻页左右键 */}
        <button
          type="button"
          aria-label="上一页"
          className="absolute left-4 top-1/2 -translate-y-1/2 z-20 hidden size-11 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-md opacity-0 shadow-lg transition-all duration-300 hover:bg-black/75 hover:scale-105 active:scale-95 lg:flex lg:group-hover/hero:opacity-100"
          onClick={() => api?.scrollPrev()}
        >
          <ChevronLeft className="size-5" />
        </button>

        <button
          type="button"
          aria-label="下一页"
          className="absolute right-4 top-1/2 -translate-y-1/2 z-20 hidden size-11 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-md opacity-0 shadow-lg transition-all duration-300 hover:bg-black/75 hover:scale-105 active:scale-95 lg:flex lg:group-hover/hero:opacity-100"
          onClick={() => api?.scrollNext()}
        >
          <ChevronRight className="size-5" />
        </button>

        {/* 底部轮播进度指示条 (Apple TV+ 指示器风格) */}
        <div className="absolute bottom-3 right-5 z-20 flex items-center gap-1.5 sm:bottom-4 sm:right-8 md:bottom-5 md:right-12 lg:bottom-6 lg:right-16">
          {items.map((_, dotIndex) => (
            <button
              key={dotIndex}
              type="button"
              aria-label={`切换到第 ${dotIndex + 1} 张`}
              onClick={() => api?.scrollTo(dotIndex)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                dotIndex === activeIndex
                  ? 'w-7 bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)]'
                  : 'w-2 bg-white/35 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      </Carousel>
    </div>
  )
}
