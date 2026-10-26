export interface DanmakuComment {
  text: string
  time: number
  mode: 0 | 1 | 2 // 0: 滚动, 1: 顶部, 2: 底部
  color: string
  border?: boolean
  id?: string
}

export interface DanmakuEpisodeMatch {
  animeId: number
  animeTitle: string
  episodeId: number
  episodeTitle: string
  episodeNumber?: number
}

export interface DandanRawComment {
  cid: number
  p: string // "time,type,color,sender,date"
  m: string
}

/**
 * 依据弹弹play API v2 规范生成 SHA256 + Base64 签名
 * 规则：RawString = AppId + Timestamp + Path (全小写) + AppSecret
 * Signature = Base64(SHA256(RawString))
 */
export async function generateDandanSignature(
  appId: string,
  appSecret: string,
  path: string,
  timestamp: number,
): Promise<string> {
  const normalizedPath = path.startsWith('/') ? path.toLowerCase() : `/${path.toLowerCase()}`
  const raw = `${appId}${timestamp}${normalizedPath}${appSecret}`
  const encoder = new TextEncoder()
  const data = encoder.encode(raw)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(hashBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * 解析 B 站 XML 标准格式弹幕
 * <d p="490.19100,1,25,16777215,1584268892,0,a16fe0dd,29950852386521095">弹幕文本</d>
 */
export function parseBilibiliXml(xmlText: string): DanmakuComment[] {
  if (!xmlText || typeof xmlText !== 'string') return []

  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'text/xml')
  const nodes = doc.querySelectorAll('d')
  const comments: DanmakuComment[] = []

  nodes.forEach(node => {
    const p = node.getAttribute('p') || ''
    const parts = p.split(',')
    if (parts.length >= 4) {
      const time = Number.parseFloat(parts[0]) || 0
      const type = Number.parseInt(parts[1], 10)
      const colorInt = Number.parseInt(parts[3], 10)
      const safeColorInt = Number.isFinite(colorInt) && colorInt >= 0 ? colorInt : 16777215
      const hexColor = safeColorInt.toString(16).padStart(6, '0')

      // Bilibili types: 1, 2, 3 = scroll(0); 4 = bottom(2); 5 = top(1)
      let mode: 0 | 1 | 2 = 0
      if (type === 5) mode = 1
      else if (type === 4) mode = 2

      const text = node.textContent?.trim()
      if (text) {
        comments.push({
          text,
          time,
          mode,
          color: `#${hexColor}`,
        })
      }
    }
  })

  return comments
}

/**
 * 解析弹弹play comment 接口返回的弹幕列表
 */
export function parseDandanComments(rawComments: DandanRawComment[]): DanmakuComment[] {
  if (!Array.isArray(rawComments)) return []
  const comments: DanmakuComment[] = []

  for (const item of rawComments) {
    if (!item || !item.m) continue
    const parts = (item.p || '').split(',')
    const time = Number.parseFloat(parts[0]) || 0
    const type = Number.parseInt(parts[1], 10)
    const colorInt = Number.parseInt(parts[2], 10)
    const safeColorInt = Number.isFinite(colorInt) && colorInt >= 0 ? colorInt : 16777215
    const hexColor = safeColorInt.toString(16).padStart(6, '0')

    // 弹弹play types: 1=滚动(0), 4=底部(2), 5=顶部(1)
    let mode: 0 | 1 | 2 = 0
    if (type === 5) mode = 1
    else if (type === 4) mode = 2

    comments.push({
      id: String(item.cid || comments.length + 1),
      text: item.m.trim(),
      time,
      mode,
      color: `#${hexColor}`,
    })
  }

  return comments
}
