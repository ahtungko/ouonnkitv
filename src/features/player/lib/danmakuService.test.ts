import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  autoMatchDanmaku,
  fetchBilibiliCidComments,
  fetchDandanComments,
  searchDandanEpisodes,
} from './danmakuService'

describe('danmakuService', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('searches dandanplay episodes and extracts episode matches', async () => {
    const mockResponse = {
      animes: [
        {
          animeId: 100,
          animeTitle: '双城之战 第一季',
          type: 'tvseries',
          episodes: [
            { episodeId: 1001, episodeTitle: '第01集 欢迎来到游乐场' },
            { episodeId: 1002, episodeTitle: '第02集 一些谜团最好不要解开' },
          ],
        },
      ],
    }

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const matches = await searchDandanEpisodes('双城之战', {
      appId: 'testApp',
      appSecret: 'testSecret',
    })

    expect(matches).toHaveLength(2)
    expect(matches[0]).toEqual({
      animeId: 100,
      animeTitle: '双城之战 第一季',
      episodeId: 1001,
      episodeTitle: '第01集 欢迎来到游乐场',
    })
  })

  it('fetches dandanplay comments for an episode', async () => {
    const mockCommentResponse = {
      count: 1,
      comments: [
        {
          cid: 555,
          p: '10.5,1,16777215,[B站]testUser,2026-01-01',
          m: '测试弹幕',
        },
      ],
    }

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockCommentResponse,
    } as Response)

    const comments = await fetchDandanComments(1001, {
      appId: 'testApp',
      appSecret: 'testSecret',
    })
    expect(comments).toHaveLength(1)
    expect(comments[0].text).toBe('测试弹幕')
    expect(comments[0].time).toBe(10.5)
  })

  it('returns empty and skips fetch when official credentials are missing', async () => {
    const matches = await searchDandanEpisodes('双城之战')
    expect(matches).toEqual([])

    const comments = await fetchDandanComments(1001)
    expect(comments).toEqual([])

    const autoResult = await autoMatchDanmaku('双城之战', 1)
    expect(autoResult.comments).toEqual([])
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('allows fetching from custom self-hosted apiBaseUrl without appId and appSecret', async () => {
    const mockResponse = {
      animes: [
        {
          animeId: 200,
          animeTitle: '庆余年',
          episodes: [{ episodeId: 2001, episodeTitle: '第01集' }],
        },
      ],
    }

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const matches = await searchDandanEpisodes('庆余年', {
      apiBaseUrl: 'https://danmu.example.workers.dev',
    })

    expect(matches).toHaveLength(1)
    expect(matches[0].animeTitle).toBe('庆余年')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/proxy?danmaku_path='),
      expect.anything(),
    )
  })

  it('fetches Bilibili CID XML comments', async () => {
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<i><d p="5.0,1,25,16777215,1588569686,0,f93c6d68,1">干杯！</d></i>`

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => sampleXml,
    } as Response)

    const comments = await fetchBilibiliCidComments(123456)
    expect(comments).toHaveLength(1)
    expect(comments[0].text).toBe('干杯！')
    expect(comments[0].time).toBe(5)
  })

  it('auto-matches target episode by episode number', async () => {
    const mockSearch = {
      animes: [
        {
          animeId: 200,
          animeTitle: '测试动画',
          type: 'tvseries',
          episodes: [
            { episodeId: 2001, episodeTitle: '第01集 开端' },
            { episodeId: 2002, episodeTitle: '第02集 发展' },
          ],
        },
      ],
    }

    const mockComments = {
      count: 1,
      comments: [
        {
          cid: 888,
          p: '2.0,1,16777215,sender,2026-01-01',
          m: '第2集打卡',
        },
      ],
    }

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearch,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockComments,
      } as Response)

    const result = await autoMatchDanmaku('测试动画', 2, {
      appId: 'testApp',
      appSecret: 'testSecret',
    })
    expect(result.match?.episodeId).toBe(2002)
    expect(result.comments).toHaveLength(1)
    expect(result.comments[0].text).toBe('第2集打卡')
  })
})
