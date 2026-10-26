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

function createTimeoutSignal(timeoutMs: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    try {
      return AbortSignal.timeout(timeoutMs)
    } catch {
      // ignore
    }
  }
  return undefined
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
    const res = await fetch(requestUrl, {
      headers,
      signal: createTimeoutSignal(8000),
    })
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
    const res = await fetch(requestUrl, {
      headers,
      signal: createTimeoutSignal(6000),
    })
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
    const res = await fetch(requestUrl, {
      signal: createTimeoutSignal(6000),
    })
    if (!res.ok) return []
    const xml = await res.text()
    return parseBilibiliXml(xml)
  } catch {
    return []
  }
}

const PREFERRED_DANMAKU_KEY = 'oki_danmaku_preferred_source'

/**
 * 清洗剧名中的附加标签、括号、分季和集数信息，提升外部弹幕库搜索命中率
 */
export function cleanAnimeTitleForSearch(title: string): string {
  return title
    .replace(/[\[\(（【].*?[\]\)）】]/g, ' ') // 去除括号内容如【微短剧】、（全集）
    .replace(/第\s*[\d一二三四五六七八九十两]+\s*[季部篇]/gi, ' ') // 去除第1季
    .replace(/\b(?:season|s)\s*\d+\b/gi, ' ')
    .replace(/(?:全|共)?\s*\d+\s*集/g, ' ') // 去除全80集
    .replace(/\b(?:4k|1080p|720p|hd|bd)\b/gi, ' ') // 去除分辨率
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeTitleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, '')
}

/**
 * 记忆特定剧名首选的弹幕源（如 360影视、腾讯视频等），持久化至 localStorage 防止刷新或重开丢失
 */
export function rememberPreferredAnime(title: string, animeTitle: string): void {
  if (!title || !animeTitle) return
  try {
    const raw = localStorage.getItem(PREFERRED_DANMAKU_KEY)
    const map = raw ? JSON.parse(raw) : {}
    map[title.trim()] = animeTitle.trim()
    map[normalizeTitleKey(title)] = animeTitle.trim()
    const cleaned = cleanAnimeTitleForSearch(title)
    if (cleaned) {
      map[normalizeTitleKey(cleaned)] = animeTitle.trim()
    }
    localStorage.setItem(PREFERRED_DANMAKU_KEY, JSON.stringify(map))
  } catch {
    // ignore localStorage errors
  }
}

/**
 * 获取特定剧名已记录的首选弹幕源
 */
export function getPreferredAnime(title: string): string | undefined {
  if (!title) return undefined
  try {
    const raw = localStorage.getItem(PREFERRED_DANMAKU_KEY)
    if (raw) {
      const map = JSON.parse(raw)
      const cleaned = cleanAnimeTitleForSearch(title)
      return (
        map[title.trim()] ||
        map[normalizeTitleKey(title)] ||
        (cleaned ? map[normalizeTitleKey(cleaned)] : undefined)
      )
    }
  } catch {
    // ignore
  }
  return undefined
}

/**
 * 检验分集标题是否匹配目标集数
 */
export function isEpisodeMatch(epTitle: string, epNum: number): boolean {
  if (!epTitle || epNum <= 0) return false
  const trimmed = epTitle.trim()
  const numStr = String(epNum)
  const pad2 = numStr.padStart(2, '0')
  const pad3 = numStr.padStart(3, '0')

  if (trimmed === numStr || trimmed === pad2 || trimmed === pad3) return true

  // 避免将第 13 集误判为第 3 集：数字前必须是非数字或边界，数字后必须是非数字或边界
  const regex = new RegExp(
    `(?:^|[^0-9])(?:第|ep|e)?\\s*0*${numStr}\\s*(?:集|话|期|\\)|】|\\]|$|\\s)`,
    'i',
  )
  return regex.test(trimmed)
}

/**
 * 自动根据剧名与集数匹配弹幕
 * 
 * 逻辑：
 * 1. 检索该剧所有相关分集候选；
 * 2. 筛选出匹配当前集数的候选源；
 * 3. 若用户之前选择或成功匹配过特定源，优先排序；
 * 4. 并发探测前 10 个候选分集（单次 6s 超时），彻底杜绝串行逐个请求导致漫长等待；
 * 5. 命中且弹幕数量 > 0 的候选集才被接纳；优先选用记忆源，其次选用弹幕数最丰富的源；
 * 6. 成功后记住该源，后续分集无缝衔接。
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

  let episodes = await searchDandanEpisodes(title, resolved)
  if (episodes.length === 0) {
    const cleaned = cleanAnimeTitleForSearch(title)
    if (cleaned && cleaned !== title.trim()) {
      episodes = await searchDandanEpisodes(cleaned, resolved)
    }
  }
  if (episodes.length === 0) {
    return { comments: [] }
  }

  // 找出所有匹配目标集数的分集
  const candidates = episodes.filter(ep => isEpisodeMatch(ep.episodeTitle, episodeNumber))

  // 若未按集数文本匹配到，则按列表顺序降级尝试
  if (candidates.length === 0 && episodes[episodeNumber - 1]) {
    candidates.push(episodes[episodeNumber - 1])
  }

  if (candidates.length === 0) {
    return { comments: [] }
  }

  // 若用户之前手动指定过或已成功命中过某源，优先将该源排在探测队列前列
  const preferred = getPreferredAnime(title)
  if (preferred) {
    candidates.sort((a, b) => {
      const aPref =
        a.animeTitle === preferred ||
        a.animeTitle.includes(preferred) ||
        preferred.includes(a.animeTitle)
          ? 1
          : 0
      const bPref =
        b.animeTitle === preferred ||
        b.animeTitle.includes(preferred) ||
        preferred.includes(b.animeTitle)
          ? 1
          : 0
      return bPref - aPref
    })
  }

  // 取前 10 个候选分集并发探测（覆盖排在后面的 360、腾讯、优酷、B站 等各源）
  const candidatePool = candidates.slice(0, 10)

  const probeResults = await Promise.all(
    candidatePool.map(async (candidate, index) => {
      try {
        const comments = await fetchDandanComments(candidate.episodeId, resolved)
        return {
          candidate,
          comments,
          index,
        }
      } catch {
        return { candidate, comments: [], index }
      }
    }),
  )

  const withComments = probeResults.filter(r => r.comments.length > 0)
  if (withComments.length === 0) {
    // 所有候选分集均无弹幕时，静默返回
    return { comments: [] }
  }

  // 若记忆源存在且有弹幕，优先使用记忆源
  if (preferred) {
    const preferredMatch = withComments.find(
      r =>
        r.candidate.animeTitle === preferred ||
        r.candidate.animeTitle.includes(preferred) ||
        preferred.includes(r.candidate.animeTitle),
    )
    if (preferredMatch) {
      rememberPreferredAnime(title, preferredMatch.candidate.animeTitle)
      return { comments: preferredMatch.comments, match: preferredMatch.candidate }
    }
  }

  // 否则优先选择弹幕数最丰富的候选；弹幕数相同时遵从源原始优先级
  withComments.sort((a, b) => {
    if (b.comments.length !== a.comments.length) {
      return b.comments.length - a.comments.length
    }
    return a.index - b.index
  })

  const best = withComments[0]
  rememberPreferredAnime(title, best.candidate.animeTitle)
  return { comments: best.comments, match: best.candidate }
}
