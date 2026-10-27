export function handleDanmu(
  request: Request,
  env: { DANMU_API_URL?: string; DANMU_API_TOKEN?: string },
): Promise<Response>
