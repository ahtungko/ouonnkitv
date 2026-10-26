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

const PREFERRED_DANMAKU_KEY = 'oki_danmaku_preferred_source'

/**
 * 记忆特定剧名首选的弹幕源（如 360影视、腾讯视频等）
 */
export function rememberPreferredAnime(title: string, animeTitle: string): void {
  if (!title || !animeTitle) return
  try {
    const raw = sessionStorage.getItem(PREFERRED_DANMAKU_KEY)
    const map = raw ? JSON.parse(raw) : {}
    map[title.trim()] = animeTitle.trim()
    sessionStorage.setItem(PREFERRED_DANMAKU_KEY, JSON.stringify(map))
  } catch {
    // ignore sessionStorage errors
  }
}

/**
 * 获取特定剧名已记录的首选弹幕源
 */
export function getPreferredAnime(title: string): string | undefined {
  if (!title) return undefined
  try {
    const raw = sessionStorage.getItem(PREFERRED_DANMAKU_KEY)
    if (raw) {
      const map = JSON.parse(raw)
      return map[title.trim()]
    }
  } catch {
    // ignore
  }
  return undefined
}

/**
 * 检验分集标题是否匹配目标集数
 */
function isEpisodeMatch(epTitle: string, epNum: number): boolean {
  const numStr = String(epNum)
  const pad2 = numStr.padStart(2, '0')
  const pad3 = numStr.padStart(3, '0')
  const trimmed = epTitle.trim()

  if (trimmed === numStr || trimmed === pad2 || trimmed === pad3) return true
  if (
    trimmed.includes(`第${numStr}集`) ||
    trimmed.includes(`第${pad2}集`) ||
    trimmed.includes(`第${pad3}集`) ||
    trimmed.includes(`第${numStr}话`) ||
    trimmed.includes(`第${pad2}话`) ||
    trimmed.includes(`第${numStr}期`) ||
    trimmed.includes(`第${pad2}期`) ||
    trimmed.includes(`EP${pad2}`) ||
    trimmed.includes(`EP${numStr}`) ||
    trimmed.includes(`ep${pad2}`) ||
    trimmed.includes(`ep${numStr}`) ||
    trimmed.includes(`E${pad2}`) ||
    trimmed.includes(`E${numStr}`) ||
    trimmed.includes(`${numStr}集`)
  ) {
    return true
  }

  const regex = new RegExp(`(?:第|ep|e|^|\\s)0*${numStr}(?:集|话|期|$|\\s|\\))`, 'i')
  return regex.test(trimmed)
}

/**
 * 自动根据剧名与集数匹配弹幕
 * 直接遵从 danmu_api 服务端定义的源排序（SOURCE_ORDER），不进行任何硬编码评分猜源
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

  // 找出所有匹配目标集数的分集，保持 danmu_api 服务端返回的原始源优先级顺序
  const candidates = episodes.filter(ep => isEpisodeMatch(ep.episodeTitle, episodeNumber))

  // 若未按集数文本匹配到，则按列表顺序降级尝试
  if (candidates.length === 0 && episodes[episodeNumber - 1]) {
    candidates.push(episodes[episodeNumber - 1])
  }

  if (candidates.length === 0) {
    return { comments: [] }
  }

  // 若用户之前手动指定过或已成功命中过某源，优先使用已绑定的源
  const preferred = getPreferredAnime(title)
  if (preferred) {
    candidates.sort((a, b) => {
      const aPref = a.animeTitle === preferred ? 1 : 0
      const bPref = b.animeTitle === preferred ? 1 : 0
      return bPref - aPref
    })
  }

  // 严格按 danmu_api 的源顺序逐个尝试拉取弹幕（最多尝试前 4 个源）
  // 命中第一个有弹幕的源即停止请求，最大化节省网络与 API 资源
  for (const candidate of candidates.slice(0, 4)) {
    try {
      const comments = await fetchDandanComments(candidate.episodeId, resolved)
      if (comments.length > 0) {
        rememberPreferredAnime(title, candidate.animeTitle)
        return { comments, match: candidate }
      }
    } catch {
      // 失败自动尝试下一个上游源
    }
  }

  // 所有候选分集均无弹幕时，静默跳过
  return { comments: [] }
}
