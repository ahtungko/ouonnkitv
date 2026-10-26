import type { ApiRequest, ApiResponse } from '../shared/serverless-http.js'
import { getProxyTimeoutMs, handleProxyRequest, parseProxyError } from '../shared/proxy-core.js'

function extractForwardHeaders(headers: Record<string, string | string[] | undefined> = {}) {
  const forward: Record<string, string> = {}
  for (const [key, val] of Object.entries(headers)) {
    const lower = key.toLowerCase()
    if (lower.startsWith('x-app') || lower.startsWith('x-time') || lower.startsWith('x-sig')) {
      if (typeof val === 'string') {
        forward[key] = val
      } else if (Array.isArray(val) && val.length > 0) {
        forward[key] = val[0]
      }
    }
  }
  return forward
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-AppId, X-Timestamp, X-Signature')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    const danmakuPath = req.query.danmaku_path
    let targetUrl: string

    if (typeof danmakuPath === 'string' && danmakuPath) {
      const serverBase = (
        process.env.DANDAN_API_BASE_URL ||
        process.env.OKI_DANDAN_API_BASE_URL ||
        'https://api.dandanplay.net'
      ).replace(/\/+$/, '')
      const cleanPath = danmakuPath.startsWith('/') ? danmakuPath : `/${danmakuPath}`
      targetUrl = `${serverBase}${cleanPath}`

      const isCommentReq = cleanPath.includes('/comment/')
      try {
        const forwardHeaders = extractForwardHeaders(req.headers)
        const response = await handleProxyRequest(targetUrl, forwardHeaders)
        if (!response.ok && isCommentReq) {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'public, max-age=60')
          return res.status(200).json({ count: 0, comments: [] })
        }
        const text = await response.text()
        const contentType = response.headers.get('content-type') || 'application/json'

        res.setHeader('Content-Type', contentType)
        res.setHeader('Cache-Control', 'public, max-age=60')
        return res.status(response.status).send(text)
      } catch (err) {
        if (isCommentReq) {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'public, max-age=60')
          return res.status(200).json({ count: 0, comments: [] })
        }
        throw err
      }
    } else {
      const { url } = req.query
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL parameter is required' })
      }
      targetUrl = decodeURIComponent(url)
    }
    const forwardHeaders = extractForwardHeaders(req.headers)
    const response = await handleProxyRequest(targetUrl, forwardHeaders)
    const text = await response.text()
    const contentType = response.headers.get('content-type') || 'application/json'

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.status(response.status).send(text)
  } catch (error) {
    const { message, cause } = parseProxyError(error)
    const timeoutMs = getProxyTimeoutMs()
    res.status(500).json({ error: 'Proxy request failed', message, cause, timeoutMs })
  }
}
