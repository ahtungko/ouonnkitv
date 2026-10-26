import {
  generateDandanSignature,
  parseBilibiliXml,
  parseDandanComments,
  type DanmakuComment,
  type DanmakuEpisodeMatch,
  type DandanRawComment,
} from './danmaku'

export interface DanmakuServiceOptions {
  proxyUrl?: string
  appId?: string
  appSecret?: string
}

export interface DandanAnimeItem {
  animeId: number
  animeTitle: string
  type: string
  episodes: Array<{
    episodeId: number
    episodeTitle: string
  }>
}

export interface DandanSearchResponse {
  hasMore?: boolean
  success?: boolean
  errorCode?: number
  errorMessage?: string
  animes?: DandanAnimeItem[]
}

export interface DandanCommentResponse {
  count?: number
  comments?: DandanRawComment[]
}

/**
 * 构建请求 URL（若指定 proxyUrl 则走代理，避免跨域）
 */
function buildProxyUrl(targetUrl: string, proxyUrl?: string): string {
  if (!proxyUrl) return targetUrl
  return `${proxyUrl}${encodeURIComponent(targetUrl)}`
}

/**
 * 构建弹弹play API 签名请求头
 */
async function buildDandanHeaders(
  path: string,
  appId?: string,
  appSecret?: string,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (appId && appSecret) {
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = await generateDandanSignature(appId, appSecret, path, timestamp)
    headers['X-AppId'] = appId
    headers['X-Timestamp'] = String(timestamp)
    headers['X-Signature'] = signature
  }

  return headers
}

/**
 * 在弹弹play 搜索剧集及分集列表
 */
export async function searchDandanEpisodes(
  title: string,
  options: DanmakuServiceOptions = {},
): Promise<DanmakuEpisodeMatch[]> {
  const trimmed = title.trim()
  if (!trimmed) return []

  const path = '/api/v2/search/episodes'
  const targetUrl = `https://api.dandanplay.net${path}?anime=${encodeURIComponent(trimmed)}`
  const requestUrl = buildProxyUrl(targetUrl, options.proxyUrl ?? '/proxy?url=')
  const headers = await buildDandanHeaders(path, options.appId, options.appSecret)

  try {
    const res = await fetch(requestUrl, { headers })
    if (!res.ok) {
      return []
    }
    const data = (await res.json()) as DandanSearchResponse
    if (!data.animes || !Array.isArray(data.animes)) {
      return []
    }

    const matches: DanmakuEpisodeMatch[] = []
    for (const anime of data.animes) {
      if (!anime.episodes || !Array.isArray(anime.episodes)) continue
      for (const ep of anime.episodes) {
        matches.push({
          animeId: anime.animeId,
          animeTitle: anime.animeTitle,
          episodeId: ep.episodeId,
          episodeTitle: ep.episodeTitle,
        })
      }
    }
    return matches
  } catch {
    return []
  }
}

/**
 * 获取指定分集的弹弹play弹幕数据
 */
export async function fetchDandanComments(
  episodeId: number,
  options: DanmakuServiceOptions = {},
): Promise<DanmakuComment[]> {
  if (!episodeId || episodeId <= 0) return []

  const path = `/api/v2/comment/${episodeId}`
  const targetUrl = `https://api.dandanplay.net${path}?withRelated=true`
  const requestUrl = buildProxyUrl(targetUrl, options.proxyUrl ?? '/proxy?url=')
  const headers = await buildDandanHeaders(path, options.appId, options.appSecret)

  try {
    const res = await fetch(requestUrl, { headers })
    if (!res.ok) {
      return []
    }
    const data = (await res.json()) as DandanCommentResponse
    return parseDandanComments(data.comments || [])
  } catch {
    return []
  }
}

/**
 * 直接通过 B 站 CID 拉取弹幕 XML
 */
export async function fetchBilibiliCidComments(
  cid: string | number,
  options: { proxyUrl?: string } = {},
): Promise<DanmakuComment[]> {
  const cidStr = String(cid).trim()
  if (!cidStr) return []

  const targetUrl = `https://comment.bilibili.com/${cidStr}.xml`
  const requestUrl = buildProxyUrl(targetUrl, options.proxyUrl ?? '/proxy?url=')

  try {
    const res = await fetch(requestUrl)
    if (!res.ok) return []
    const xml = await res.text()
    return parseBilibiliXml(xml)
  } catch {
    return []
  }
}

/**
 * 自动根据剧名与集数匹配弹幕
 */
export async function autoMatchDanmaku(
  title: string,
  episodeNumber: number,
  options: DanmakuServiceOptions = {},
): Promise<{ comments: DanmakuComment[]; match?: DanmakuEpisodeMatch }> {
  const episodes = await searchDandanEpisodes(title, options)
  if (episodes.length === 0) {
    return { comments: [] }
  }

  // 尝试匹配目标集数：
  // 1. 查找包含例如 "第01集"、"第1集" 或以数字结尾的分集
  const epNumStr = String(episodeNumber)
  const padEpNumStr = epNumStr.padStart(2, '0')

  const matched =
    episodes.find(ep => {
      const epTitle = ep.episodeTitle
      return (
        epTitle.includes(`第${epNumStr}集`) ||
        epTitle.includes(`第${padEpNumStr}集`) ||
        epTitle.includes(`EP${padEpNumStr}`) ||
        epTitle.includes(`EP${epNumStr}`) ||
        epTitle === epNumStr ||
        epTitle === padEpNumStr
      )
    }) || episodes[episodeNumber - 1] // 若未明确匹配到标题，按顺序索引降级尝试

  if (!matched) {
    return { comments: [] }
  }

  const comments = await fetchDandanComments(matched.episodeId, options)
  return { comments, match: matched }
}
