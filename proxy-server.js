import express from 'express'
import { handleDanmu } from './shared/danmu-core.js'
import cors from 'cors'
import { getProxyTimeoutMs, parseProxyError, handleProxyRequest } from './shared/proxy-core.js'

const app = express()
const PORT = process.env.PROXY_PORT || 3001

app.use(cors({ origin: '*' }))

app.all('/api/danmu', async (req, res) => {
  const result = await handleDanmu(new Request('http://localhost' + req.originalUrl, { method: req.method }), process.env)
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.status(result.status).send(await result.text())
})

app.get('/proxy', async (req, res) => {
  try {
    const { url } = req.query
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' })
    }

    const targetUrl = decodeURIComponent(url)
    const response = await handleProxyRequest(targetUrl)
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
