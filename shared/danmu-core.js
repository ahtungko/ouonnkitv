// Only these read operations are exposed; the upstream address and token never reach the client.
export async function handleDanmu(request, env) {
  const reply = (body, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
  if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405)
  const base = env.DANMU_API_URL,
    token = env.DANMU_API_TOKEN
  if (!base || !token) return reply({ error: 'Danmu is not configured' }, 503)
  const query = new URL(request.url).searchParams
  const action = query.get('action'),
    value = query.get('value') || ''
  let path,
    options = {}
  if (action === 'match' && value.trim() && value.length <= 200) {
    path = 'match'
    options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: value }),
    }
  } else if (action === 'search' && value.trim() && value.length <= 200) {
    path = 'search/anime?keyword=' + encodeURIComponent(value)
  } else if ((action === 'detail' || action === 'comments') && /^\d{1,20}$/.test(value)) {
    path =
      (action === 'detail' ? 'bangumi/' : 'comment/') +
      value +
      (action === 'comments' ? '?format=json' : '')
  } else return reply({ error: 'Invalid request' }, 400)
  try {
    const root = new URL(base)
    if (
      !['http:', 'https:'].includes(root.protocol) ||
      root.username ||
      root.password ||
      root.search ||
      root.hash
    )
      throw Error()
    root.pathname =
      root.pathname.replace(/\/+$/, '') +
      '/' +
      encodeURIComponent(token) +
      '/api/v2/' +
      path.split('?')[0]
    root.search = path.includes('?') ? path.slice(path.indexOf('?')) : ''
    const response = await fetch(root, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) return reply({ error: 'Danmu service unavailable' }, 502)
    const data = await response.json()
    const clean = value =>
      typeof value === 'string'
        ? value.replaceAll(token, '[redacted]').replaceAll(base, '[redacted]')
        : value
    const pick = (item, keys) =>
      Object.fromEntries(keys.filter(k => item?.[k] != null).map(k => [k, clean(item[k])]))
    if (action === 'match')
      return reply({
        matches: (data.matches || []).map(x =>
          pick(x, ['animeTitle', 'episodeTitle', 'episodeId']),
        ),
      })
    if (action === 'search')
      return reply({
        animes: (data.animes || []).map(x => pick(x, ['animeId', 'animeTitle', 'typeDescription'])),
      })
    if (action === 'detail')
      return reply({
        bangumi: {
          episodes: (data.bangumi?.episodes || []).map(x => pick(x, ['episodeId', 'episodeTitle'])),
        },
      })
    return reply({ comments: (data.comments || []).map(x => pick(x, ['p', 'm'])) })
  } catch {
    return reply({ error: 'Danmu service unavailable' }, 502)
  }
}
