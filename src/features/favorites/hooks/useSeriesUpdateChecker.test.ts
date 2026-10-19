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

const mocks = vi.hoisted(() => {
  const tmdbDetails = vi.fn()
  return {
    getDetail: vi.fn(),
    search: vi.fn(),
    destroy: vi.fn(),
    tmdbDetails,
    tmdbClient: { tvShows: { details: tmdbDetails } },
  }
})
vi.mock('@/shared/lib/tmdb', async importOriginal => ({
  ...(await importOriginal<typeof import('@/shared/lib/tmdb')>()),
  getTmdbClient: () => mocks.tmdbClient,
}))
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
  mocks.tmdbClient = { tvShows: { details: mocks.tmdbDetails } }
  mocks.tmdbDetails.mockReset().mockResolvedValue({
    seasons: [
      { season_number: 0, name: '特别篇' },
      { season_number: 1, name: '第 1 季' },
      { season_number: 2, name: '重逢篇' },
    ],
  })
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

const openProgress = () =>
  act(async () => {
    host.querySelector<HTMLButtonElement>('[aria-label="校准测试剧观看进度"]')!.click()
  })
const setProgressInput = (value: string) =>
  act(async () => {
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
const progressButton = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(
    button => button.textContent === text,
  )!
const clickProgressButton = (text: string) => act(async () => progressButton(text).click())

describe('追更交互与后台检查', () => {
  it('首次检查只有待看，后续新增单独提醒；标记已读保留观看进度与待看数', async () => {
    const id = useFavoritesStore.getState().favorites[0].id
    useFavoritesStore.getState().setTracking(id, { enabled: true })
    await mount()
    await settle()
    expect(host.querySelector('article')?.textContent).toContain('2 集待看')
    expect(host.querySelector('article')?.textContent).not.toContain('新增')
    mocks.getDetail.mockResolvedValueOnce({
      ...detail,
      episodes: [...detail.episodes, 'https://x/3', 'https://x/4'],
      videoInfo: { ...detail.videoInfo, episodes_names: ['第01集', '第02集', '第03集', '第04集'] },
    })
    await clickRefresh()
    expect(host.querySelector('article')?.textContent).toContain('新增 2 集')
    expect(host.querySelector('article')?.textContent).toContain('4 集待看')
    expect(host.textContent).toContain('1 部有更新')
    const favorite = useFavoritesStore.getState().favorites[0]
    const history = useViewingHistoryStore.getState().viewingHistory
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="标记测试剧更新提醒为已读"]')!.click(),
    )
    expect(host.querySelector('article')?.textContent).not.toContain('新增')
    expect(host.querySelector('article')?.textContent).toContain('4 集待看')
    expect(host.textContent).not.toContain('部有更新')
    expect(useFavoritesStore.getState().favorites[0]).toBe(favorite)
    expect(useViewingHistoryStore.getState().viewingHistory).toBe(history)
    await settle()
    expect(mocks.getDetail).toHaveBeenCalledTimes(2)
  })

  it('同一源ID的地址变更只重建基准，不把更多旧集误报为新增', async () => {
    useFavoritesStore
      .getState()
      .setTracking(useFavoritesStore.getState().favorites[0].id, { enabled: true })
    await mount()
    await settle()
    mocks.getDetail.mockResolvedValue({
      ...detail,
      episodes: [...detail.episodes, 'https://x/3'],
      videoInfo: { ...detail.videoInfo, episodes_names: ['第01集', '第02集', '第03集'] },
    })
    await act(async () =>
      useApiStore.setState({
        videoAPIs: [{ id: 's', name: '源', url: 'https://new-source/api', isEnabled: true }],
      }),
    )
    await settle()
    expect(host.querySelector('article')?.textContent).toContain('3 集待看')
    expect(host.querySelector('article')?.textContent).not.toContain('新增')
  })

  it('有新集的剧优先于仅待看的剧展示', async () => {
    const store = useFavoritesStore.getState()
    const id = store.favorites[0].id
    store.setTracking(id, { enabled: true })
    store.addCmsFavorite({ vod_id: 'b', vod_name: '旧剧', source_code: 's', source_name: '源' })
    store.setTracking(useFavoritesStore.getState().favorites[0].id, { enabled: true })
    await mount()
    await settle()
    const ownerId = useAuthStore.getState().account!.id
    const key = `${id}::cms`
    const previous = useSeriesUpdatesStore.getState().entries[key]
    await act(async () =>
      useSeriesUpdatesStore.getState().saveResult(ownerId, key, {
        ...previous,
        checkedAt: 1,
        episodes: [...previous.episodes!, { index: 2, number: 3 }],
      }),
    )
    expect(host.querySelector('article h3')?.textContent).toBe('测试剧')
    expect(host.querySelector('article')?.textContent).toContain('新增 1 集')
  })

  it('校准立即更新待看数与续播入口，可改回0或恢复历史自动计算，且不重复查源', async () => {
    const id = useFavoritesStore.getState().favorites[0].id
    useFavoritesStore.getState().setTracking(id, { enabled: true })
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
    })
    await mount()
    await settle()
    expect(host.textContent).toContain('已追平')
    await openProgress()
    await setProgressInput('1')
    await clickProgressButton('保存进度')
    expect(host.textContent).toContain('1 集待看')
    expect(host.querySelector('a[href="/play/cms/s/a?ep=1"]')).not.toBeNull()
    expect(useFavoritesStore.getState().favorites[0].tracking?.progress?.cms.completedEpisode).toBe(
      1,
    )
    await settle()
    expect(mocks.getDetail).toHaveBeenCalledTimes(1)
    await openProgress()
    await setProgressInput('0')
    await clickProgressButton('保存进度')
    expect(host.textContent).toContain('2 集待看')
    await openProgress()
    await clickProgressButton('恢复自动计算')
    expect(host.textContent).toContain('已追平')
    expect(useFavoritesStore.getState().favorites[0].tracking?.progress).toBeUndefined()
    expect(useViewingHistoryStore.getState().viewingHistory).toHaveLength(1)
  })

  it('标记已追平只标记当前已知剧集，之后新增剧集仍提示待看', async () => {
    useFavoritesStore
      .getState()
      .setTracking(useFavoritesStore.getState().favorites[0].id, { enabled: true })
    await mount()
    await settle()
    await openProgress()
    await clickProgressButton('标记已追平')
    await clickProgressButton('保存进度')
    expect(host.textContent).toContain('已追平')
    mocks.getDetail.mockResolvedValueOnce({
      ...detail,
      episodes: [...detail.episodes, 'https://x/3'],
      videoInfo: { ...detail.videoInfo, episodes_names: ['第01集', '第02集', '第03集'] },
    })
    await clickRefresh()
    expect(host.textContent).toContain('1 集待看')
    expect(host.querySelector('a[href="/play/cms/s/a?ep=2"]')).not.toBeNull()
  })

  it('无效输入不能保存，取消编辑不会修改进度', async () => {
    useFavoritesStore
      .getState()
      .setTracking(useFavoritesStore.getState().favorites[0].id, { enabled: true })
    await mount()
    await settle()
    await openProgress()
    for (const value of ['', '-1', '1.5']) {
      await setProgressInput(value)
      expect(progressButton('保存进度').disabled).toBe(true)
    }
    await setProgressInput('9')
    await clickProgressButton('取消')
    expect(useFavoritesStore.getState().favorites[0].tracking?.progress).toBeUndefined()
  })

  it('不同季保留各自校准，切季时未提交的编辑自动关闭', async () => {
    setTmdbFavorite()
    useFavoritesStore.getState().setTracking('tmdb_tv_1', { enabled: true, seasonNumber: 2 })
    await mount()
    await settle()
    await openProgress()
    await setProgressInput('9')
    await clickProgressButton('保存进度')
    await act(async () =>
      useFavoritesStore.getState().setTracking('tmdb_tv_1', { enabled: true, seasonNumber: 1 }),
    )
    await openProgress()
    expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe('0')
    await setProgressInput('3')
    await clickProgressButton('保存进度')
    await act(async () =>
      useFavoritesStore.getState().setTracking('tmdb_tv_1', { enabled: true, seasonNumber: 2 }),
    )
    await openProgress()
    expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe('9')
    await setProgressInput('6')
    await act(async () =>
      useFavoritesStore.getState().setTracking('tmdb_tv_1', { enabled: true, seasonNumber: 1 }),
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await act(async () =>
      useFavoritesStore.getState().setTracking('tmdb_tv_1', { enabled: true, seasonNumber: 2 }),
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    const progress = useFavoritesStore.getState().favorites[0].tracking?.progress
    expect(progress?.['1'].completedEpisode).toBe(3)
    expect(progress?.['2'].completedEpisode).toBe(9)
  })

  it('按需加载实际季列表，不补齐缺失的季，也不包含特别篇', async () => {
    setTmdbFavorite()
    mocks.tmdbDetails.mockResolvedValue({
      seasons: [
        { season_number: 0, name: '特别篇' },
        { season_number: 3, name: '归来篇' },
        { season_number: 100, name: '终章' },
      ],
    })
    await mount()
    expect(mocks.tmdbDetails).not.toHaveBeenCalled()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="开启追更：测试剧"]')!.click(),
    )
    expect(mocks.tmdbDetails).toHaveBeenCalledTimes(1)
    const select = host.querySelector<HTMLSelectElement>('select')!
    expect([...select.options].map(option => option.value)).toEqual(['3', '100'])
    expect(select.textContent).toContain('归来篇')
    expect(select.value).toBe('3')
    await act(async () => {
      select.value = '100'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(useFavoritesStore.getState().favorites[0].tracking?.seasonNumber).toBe(100)
    // 重新开启时沿用已保存季数，元数据请求复用缓存。
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="取消追更：测试剧"]')!.click(),
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="开启追更：测试剧"]')!.click(),
    )
    expect(useFavoritesStore.getState().favorites[0].tracking?.seasonNumber).toBe(100)
    expect(mocks.tmdbDetails).toHaveBeenCalledTimes(1)
  })

  it('季信息失败时不猜季数，重试成功后才开启追更', async () => {
    setTmdbFavorite()
    mocks.tmdbDetails.mockRejectedValueOnce(new Error('offline'))
    await mount()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="开启追更：测试剧"]')!.click(),
    )
    expect(host.textContent).toContain('季信息加载失败')
    expect(useFavoritesStore.getState().favorites[0].tracking).toBeUndefined()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="开启追更：测试剧"]')!.click(),
    )
    expect(useFavoritesStore.getState().favorites[0].tracking).toEqual({
      enabled: true,
      seasonNumber: 1,
    })
    expect(mocks.tmdbDetails).toHaveBeenCalledTimes(2)
  })

  it('空季列表不编造第1季；已保存但暂缺资料的季不会自动改写', async () => {
    setTmdbFavorite()
    mocks.tmdbDetails.mockResolvedValueOnce({ seasons: [] })
    await mount()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="开启追更：测试剧"]')!.click(),
    )
    expect(useFavoritesStore.getState().favorites[0].tracking).toBeUndefined()
    expect(host.textContent).toContain('暂无可追更的正片季')
    await act(async () =>
      useFavoritesStore.getState().setTracking('tmdb_tv_1', { enabled: true, seasonNumber: 9 }),
    )
    expect(host.querySelector<HTMLSelectElement>('select')?.value).toBe('9')
    expect(host.querySelector('select')?.textContent).toContain('已保存，待确认')
    expect(useFavoritesStore.getState().favorites[0].tracking?.seasonNumber).toBe(9)
  })

  it('季信息返回前取消挂载，不会开启追更', async () => {
    setTmdbFavorite()
    let resolve!: (value: { seasons: { season_number: number; name: string }[] }) => void
    mocks.tmdbDetails.mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done
        }),
    )
    await mount()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="开启追更：测试剧"]')!.click(),
    )
    expect(host.textContent).toContain('加载季信息')
    await act(async () => root.render(null))
    await act(async () => resolve({ seasons: [{ season_number: 1, name: '第1季' }] }))
    expect(useFavoritesStore.getState().favorites[0].tracking).toBeUndefined()
  })

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
