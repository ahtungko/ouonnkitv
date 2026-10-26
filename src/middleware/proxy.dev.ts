import type { Plugin } from 'vite'
import {
  handleProxyRequest,
  getProxyTimeoutMs,
  getTargetUrl,
  parseProxyError,
} from '../shared/lib/proxy'

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

export function proxyMiddleware(): Plugin {
  return {
    name: 'proxy-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/proxy')) {
          return next()
        }

        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
          res.setHeader(
            'Access-Control-Allow-Headers',
            'Content-Type, X-AppId, X-Timestamp, X-Signature',
          )
          res.writeHead(200)
          res.end()
          return
        }

        try {
          const targetUrl = getTargetUrl(req.url)
          const forwardHeaders = extractForwardHeaders(req.headers)
          const response = await handleProxyRequest(targetUrl, forwardHeaders)
          const text = await response.text()
          const contentType = response.headers.get('content-type') || 'application/json'

          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Content-Type', contentType)
          res.writeHead(response.status)
          res.end(text)
        } catch (error) {
          const { message, cause } = parseProxyError(error)
          const timeoutMs = getProxyTimeoutMs()
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Proxy request failed', message, cause, timeoutMs }))
        }
      })
    },
  }
}
