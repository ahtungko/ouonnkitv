import type { Handler } from '@netlify/functions'
import { handleDanmu } from '../../shared/danmu-core.js'
export const handler: Handler = async event => {
  const url = new URL('http://localhost/api/danmu')
  for (const [key, value] of Object.entries(event.queryStringParameters || {}))
    if (value != null) url.searchParams.set(key, value)
  const response = await handleDanmu(new Request(url, { method: event.httpMethod }), process.env)
  return {
    statusCode: response.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: await response.text(),
  }
}
