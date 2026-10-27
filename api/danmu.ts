import type { ApiRequest, ApiResponse } from '../shared/serverless-http.js'
import { handleDanmu } from '../shared/danmu-core.js'
export default async function handler(req: ApiRequest, res: ApiResponse) {
  const response = await handleDanmu(
    new Request('http://localhost' + (req.url || '/api/danmu'), { method: req.method }),
    process.env,
  )
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.status(response.status).send(await response.text())
}
