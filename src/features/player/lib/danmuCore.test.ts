import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleDanmu } from '../../../../shared/danmu-core.js'

const env = { DANMU_API_URL: 'https://private.example/base', DANMU_API_TOKEN: 'secret-token' }
const request = (action: string, value: string) =>
  new Request('https://app.example/api/danmu?' + new URLSearchParams({ action, value }))
afterEach(() => vi.unstubAllGlobals())
describe('danmu server boundary', () => {
  it('sends match to the configured service and returns only safe fields', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          matches: [
            { episodeId: 12, animeTitle: 'Title', episodeTitle: 'E1', url: 'secret-token' },
          ],
        }),
      )
    vi.stubGlobal('fetch', fetcher)
    const response = await handleDanmu(request('match', 'Title S01E01'), env)
    expect(fetcher.mock.calls[0][0].toString()).toBe(
      'https://private.example/base/secret-token/api/v2/match',
    )
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ fileName: 'Title S01E01' })
    expect(await response.json()).toEqual({
      matches: [{ episodeId: 12, animeTitle: 'Title', episodeTitle: 'E1' }],
    })
  })
  it('rejects arbitrary operations and ids without fetching', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect((await handleDanmu(request('comments', '../admin'), env)).status).toBe(400)
    expect((await handleDanmu(request('admin', '1'), env)).status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('does not expose upstream errors or secrets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('secret-token https://private.example/base')),
    )
    const response = await handleDanmu(request('comments', '1'), env)
    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain('secret-token')
  })
  it('fails closed when configuration is missing', async () => {
    expect((await handleDanmu(request('search', 'title'), {})).status).toBe(503)
  })
})
