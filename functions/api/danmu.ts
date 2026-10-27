import { handleDanmu } from '../../shared/danmu-core.js'
export function onRequest(context: {
  request: Request
  env: { DANMU_API_URL?: string; DANMU_API_TOKEN?: string }
}) {
  return handleDanmu(context.request, context.env)
}
