import express from 'express'
import cors from 'cors'
import { getProxyTimeoutMs, parseProxyError, handleProxyRequest } from './shared/proxy-core.js'

function extractForwardHeaders(headers = {}) {
  const forward = {}
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

const app = express()
const PORT = process.env.PROXY_PORT || 3001

app.use(cors({ origin: '*', allowedHeaders: ['Content-Type', 'X-AppId', 'X-Timestamp', 'X-Signature'] }))

app.get('/proxy', async (req, res) => {
  try {
    const { url } = req.query
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' })
    }

    const targetUrl = decodeURIComponent(url)
    const forwardHeaders = extractForwardHeaders(req.headers)
    const response = await handleProxyRequest(targetUrl, forwardHeaders)
    const text = await response.text()
    const contentType = response.headers.get('content-type') || 'application/json'

    res.setHeader('Content-Type', contentType)
    res.status(response.status).send(text)
  } catch (error) {
    const { message, cause } = parseProxyError(error)
    res.status(500).json({
      error: 'Proxy request failed',
      message,
      cause,
      timeoutMs: getProxyTimeoutMs(),
    })
  }
})

app.listen(PORT, () => console.log(`Proxy server on :${PORT}`))
