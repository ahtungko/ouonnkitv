import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { DetailResult } from '@ouonnki/cms-core'
import { useSeriesUpdateChecker } from './useSeriesUpdateChecker'
import { useFavoritesStore } from '../store/favoritesStore'
import { useSeriesUpdatesStore } from '../store/seriesUpdatesStore'
import { useAuthStore } from '@/shared/store/authStore'
import { useApiStore } from '@/shared/store/apiStore'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'
import { useSettingStore } from '@/shared/store/settingStore'
import { accountSchema } from '../../../../shared/account-rules'
import { TrackingControl } from '../components/TrackingControl'
import { SeriesUpdates } from '@/features/home/components/SeriesUpdates'

const mocks = vi.hoisted(() => ({ getDetail: vi.fn(), search: vi.fn(), destroy: vi.fn() }))
vi.mock('@ouonnki/cms-core', async importOriginal => ({
  ...(await importOriginal<typeof import('@ouonnki/cms-core')>()),
  createCmsClient: () => mocks,
}))

const detail: DetailResult = {
  success: true,
  episodes: ['https://x/1', 'https://x/2'],
  videoInfo: { title: '测试剧', episodes_names: ['第01集', '第02集'] },
}

function setTmdbFavorite() {
  const item = useFavoritesStore.getState().favorites[0]
  useFavoritesStore.setState({
    favorites: [
      {
        ...item,
        sourceType: 'tmdb',
        id: 'tmdb_tv_1',
        media: {
          id: 1,
          mediaType: 'tv',
          title: '测试剧',
          originalTitle: 'Test Show',
          posterPath: '/poster.jpg',
          backdropPath: null,
          releaseDate: '2024-01-01',
          voteAverage: 8,
        },
      },
    ],
  })
}

let host: HTMLDivElement
let root: Root

function Harness() {
  useSeriesUpdateChecker()
  const item = useFavoritesStore(state => state.favorites[0])
  return createElement(
    MemoryRouter,
    null,
    createElement(SeriesUpdates),
    item && createElement(TrackingControl, { item }),
  )
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  localStorage.clear()
  mocks.getDetail.mockReset().mockResolvedValue(detail)
  mocks.search.mockReset().mockResolvedValue({ success: true, items: [] })
  useSettingStore.getState().setSystemSettings({ tmdbEnabled: true })
  useFavoritesStore.setState({ favorites: [], filteredFavorites: [] })
  useFavoritesStore
    .getState()
    .addCmsFavorite({ vod_id: 'a', vod_name: '测试剧', source_code: 's', source_name: '源' })
  useSeriesUpdatesStore.setState({ ownerId: null, entries: {}, checking: false, refreshToken: 0 })
  useViewingHistoryStore.setState({ viewingHistory: [] })
  useApiStore.setState({
    videoAPIs: [{ id: 's', name: '源', url: 'https://x/api', isEnabled: true }],
  })
  useAuthStore.setState({
    account: accountSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      username: 'test',
      role: 'user',
      enabled: true,
      created_at: '2026-10-18',
    }),
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
})
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(350)
  })
const mount = () => act(async () => root.render(createElement(Harness)))
const clickRefresh = async () => {
  const button = Array.from(host.querySelectorAll('button')).find(button =>
    button.textContent?.includes('检查更新'),
  )
  expect(button).toBeDefined()
  await act(async () => button!.click())
  await settle()
}

describe('追更交互与后台检查', () => {
  it.each(['cms', 'tmdb'] as const)('%s 检查前和检查失败后，海报与标题仍可跳转', async type => {
    if (type === 'tmdb') setTmdbFavorite()
    const item = useFavoritesStore.getState().favorites[0]
    useFavoritesStore.getState().setTracking(item.id, { enabled: true, seasonNumber: 1 })
    mocks.getDetail.mockResolvedValue({ success: false, episodes: [], error: '源站超时' })
    await mount()
    const expectedPath = type === 'tmdb' ? '/media/tv/1' : '/play/cms/s/a'
    const expectLinks = () => {
      expect(host.querySelector('a[aria-label="打开测试剧"]')?.getAttribute('href')).toBe(
        expectedPath,
      )
      expect(host.querySelector('h3 a')?.getAttribute('href')).toBe(expectedPath)
      expect(host.querySelector(`a[href^="${expectedPath}?ep="]`)).toBeNull()
    }
    expectLinks()
    await settle()
    expect(host.querySelector('article')?.textContent).toContain(
      type === 'cms' ? '源站超时' : '未找到可确认',
    )
    expectLinks()
  })

  it('开启 TMDB 追更沿用最近的正片季，跳过第0季特别篇', async () => {
    setTmdbFavorite()
    useViewingHistoryStore.setState({
      viewingHistory: [0, 2].map((season, index) => ({
        recordType: 'tmdb',
        title: '测试剧',
        imageUrl: '',
        sourceCode: 's',
        sourceName: '源',
        vodId: 'a',
        tmdbId: 1,
        tmdbMediaType: 'tv',
        tmdbSeasonNumber: season,
        episodeIndex: 0,
        timestamp: 2 - index,
        playbackPosition: 95,
        duration: 100,
      })),
    })
    await mount()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="开启追更：测试剧"]')!.click(),
    )
    expect(useFavoritesStore.getState().favorites[0].tracking).toEqual({
      enabled: true,
      seasonNumber: 2,
    })
  })

  it('从收藏开启追更后自动检查，观看进度会实时消除待看提醒', async () => {
    await mount()
    expect(host.querySelector('section[aria-label="追剧更新"]')).toBeNull()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="开启追更：测试剧"]')!.click(),
    )
    await settle()
    expect(mocks.getDetail).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('2 集待看')
    expect(host.querySelector('a[href="/play/cms/s/a?ep=0"]')).not.toBeNull()
    await act(async () =>
      useViewingHistoryStore.setState({
        viewingHistory: [
          {
            recordType: 'cms',
            title: '测试剧',
            imageUrl: '',
            sourceCode: 's',
            sourceName: '源',
            vodId: 'a',
            episodeIndex: 1,
            episodeName: '第02集',
            timestamp: 1,
            playbackPosition: 95,
            duration: 100,
          },
        ],
      }),
    )
    expect(host.textContent).toContain('已追平')
    expect(host.textContent).not.toContain('2 集待看')
    // 云同步仅改变观看状态时，不重复请求视频源。
    await act(async () => useFavoritesStore.getState()._applyFilters())
    await settle()
    expect(mocks.getDetail).toHaveBeenCalledTimes(1)
  })

  it('刷新失败保留上次结果，手动刷新可立即重试并发现新增集数', async () => {
    useFavoritesStore
      .getState()
      .setTracking(useFavoritesStore.getState().favorites[0].id, { enabled: true })
    await mount()
    await settle()
    mocks.getDetail.mockResolvedValueOnce({ success: false, episodes: [], error: '源站超时' })
    await clickRefresh()
    expect(host.textContent).toContain('显示上次成功结果')
    expect(host.textContent).toContain('2 集待看')
    mocks.getDetail.mockResolvedValueOnce({
      ...detail,
      episodes: [...detail.episodes, 'https://x/3'],
      videoInfo: { ...detail.videoInfo, episodes_names: ['第01集', '第02集', '第03集'] },
    })
    await clickRefresh()
    expect(host.textContent).toContain('3 集待看')
    expect(host.textContent).not.toContain('源站超时')
  })

  it('取消追更会清掉缓存，进行中的迟到请求不能恢复提醒', async () => {
    const item = useFavoritesStore.getState().favorites[0]
    useFavoritesStore.getState().setTracking(item.id, { enabled: true })
    let resolve!: (detail: DetailResult) => void
    mocks.getDetail.mockImplementationOnce(
      () =>
        new Promise<DetailResult>(done => {
          resolve = done
        }),
    )
    await mount()
    await settle()
    await act(async () => useFavoritesStore.getState().setTracking(item.id, { enabled: false }))
    await act(async () => resolve(detail))
    expect(useSeriesUpdatesStore.getState().entries).toEqual({})
    expect(host.querySelector('section[aria-label="追剧更新"]')).toBeNull()
  })
})
