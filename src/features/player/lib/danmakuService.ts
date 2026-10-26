import { getPublicEnv } from '@/shared/config/runtimeEnv'
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
  apiBaseUrl?: string
  appId?: string
  appSecret?: string
}

export interface ResolvedDanmakuOptions {
  proxyUrl?: string
  apiBaseUrl: string
  appId: string
  appSecret: string
  isOfficial: boolean
  canRequest: boolean
}

export function normalizeApiBaseUrl(apiBaseUrl?: string): string {
  const trimmed = (apiBaseUrl || 'https://api.dandanplay.net').trim()
  return trimmed.replace(/\/+$/, '')
}

export function isOfficialDandanApi(baseUrl: string): boolean {
  return baseUrl.includes('dandanplay.net')
}

export function resolveDanmakuOptions(options: DanmakuServiceOptions = {}): ResolvedDanmakuOptions {
  const envBaseUrl = getPublicEnv('OKI_DANDAN_API_BASE_URL')
  const envAppId = getPublicEnv('OKI_DANDAN_APP_ID')
  const envAppSecret = getPublicEnv('OKI_DANDAN_APP_SECRET')

  // 若设置中配置了非官方自建地址，优先使用；
  // 若设置中为空或仍为默认官方地址且环境变量指定了自定义地址，优先使用环境变量
  let rawBaseUrl = options.apiBaseUrl?.trim()
  if (!rawBaseUrl || (rawBaseUrl === 'https://api.dandanplay.net' && envBaseUrl)) {
    rawBaseUrl = envBaseUrl || 'https://api.dandanplay.net'
  }
  const apiBaseUrl = normalizeApiBaseUrl(rawBaseUrl)

  const appId = (options.appId || envAppId || '').trim()
  const appSecret = (options.appSecret || envAppSecret || '').trim()
  const isOfficial = isOfficialDandanApi(apiBaseUrl)
  const canRequest = isOfficial ? Boolean(appId && appSecret) : Boolean(apiBaseUrl)

  return {
    proxyUrl: options.proxyUrl,
    apiBaseUrl,
    appId,
    appSecret,
    isOfficial,
    canRequest,
  }
}

export function canRequestDanmakuApi(options: DanmakuServiceOptions): boolean {
  return resolveDanmakuOptions(options).canRequest
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
 * 构建请求 URL（若指定 proxyUrl 则走代理，避免跨域并可由服务端代理屏蔽 Token）
 */
function buildProxyUrl(targetUrl: string, proxyUrl?: string, danmakuPath?: string): string {
  if (!proxyUrl) return targetUrl
  if (danmakuPath && (proxyUrl === '/proxy?url=' || proxyUrl === '/proxy')) {
    return `/proxy?danmaku_path=${encodeURIComponent(danmakuPath)}`
  }
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

  const resolved = resolveDanmakuOptions(options)
  if (!resolved.canRequest) return []

  const path = '/api/v2/search/episodes'
  const pathWithQuery = `${path}?anime=${encodeURIComponent(trimmed)}`
  const targetUrl = `${resolved.apiBaseUrl}${pathWithQuery}`
  const requestUrl = buildProxyUrl(targetUrl, resolved.proxyUrl ?? '/proxy?url=', pathWithQuery)
  const headers = await buildDandanHeaders(path, resolved.appId, resolved.appSecret)

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

  const resolved = resolveDanmakuOptions(options)
  if (!resolved.canRequest) return []

  const path = `/api/v2/comment/${episodeId}`
  const pathWithQuery = `${path}?withRelated=true`
  const targetUrl = `${resolved.apiBaseUrl}${pathWithQuery}`
  const requestUrl = buildProxyUrl(targetUrl, resolved.proxyUrl ?? '/proxy?url=', pathWithQuery)
  const headers = await buildDandanHeaders(path, resolved.appId, resolved.appSecret)

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
  const resolved = resolveDanmakuOptions(options)
  if (!resolved.canRequest) {
    return { comments: [] }
  }

  const episodes = await searchDandanEpisodes(title, resolved)
  if (episodes.length === 0) {
    return { comments: [] }
  }

  const epNumStr = String(episodeNumber)
  const padEpNumStr = epNumStr.padStart(2, '0')

  // 找出所有匹配目标集数的候选分集（可能聚合自腾讯、爱奇艺、优酷、B站等不同平台源）
  const candidates = episodes.filter(ep => {
    const epTitle = ep.episodeTitle
    return (
      epTitle.includes(`第${epNumStr}集`) ||
      epTitle.includes(`第${epNumStr}话`) ||
      epTitle.includes(`第${padEpNumStr}集`) ||
      epTitle.includes(`第${padEpNumStr}话`) ||
      epTitle.includes(`EP${padEpNumStr}`) ||
      epTitle.includes(`EP${epNumStr}`) ||
      epTitle === epNumStr ||
      epTitle === padEpNumStr
    )
  })

  // 若未按集数文本匹配到，则按列表顺序降级尝试
  if (candidates.length === 0 && episodes[episodeNumber - 1]) {
    candidates.push(episodes[episodeNumber - 1])
  }

  if (candidates.length === 0) {
    return { comments: [] }
  }

  // 优质源优先排序（腾讯、B站、爱奇艺、优酷弹幕更丰富且成功率更高）
  candidates.sort((a, b) => {
    const getScore = (title: string) => {
      const lower = title.toLowerCase()
      if (lower.includes('qq') || lower.includes('tencent')) return 4
      if (lower.includes('bilibili')) return 3
      if (lower.includes('iqiyi')) return 2
      if (lower.includes('youku')) return 1
      return 0
    }
    return getScore(b.episodeTitle) - getScore(a.episodeTitle)
  })

  // 逐个尝试拉取候选分集弹幕（最多尝试前 4 个），找到有效弹幕立即返回
  for (const candidate of candidates.slice(0, 4)) {
    const comments = await fetchDandanComments(candidate.episodeId, resolved)
    if (comments.length > 0) {
      return { comments, match: candidate }
    }
  }

  return { comments: [] }
}
