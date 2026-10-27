import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type Artplayer from 'artplayer'
import danmuku, { type Danmu, type Result } from 'artplayer-plugin-danmuku'

type Match = { episodeId: number; animeTitle: string; episodeTitle: string }
type Anime = { animeId: number; animeTitle: string }
type Episode = { episodeId: number; episodeTitle: string }
const cache = new Map<string, Danmu[]>()
const matches = new Map<string, Match>()
async function api(action: string, value: string, signal?: AbortSignal) {
  const response = await fetch('/api/danmu?' + new URLSearchParams({ action, value }), { signal })
  if (!response.ok) throw new Error('弹幕服务不可用')
  return response.json()
}
async function comments(id: number, signal: AbortSignal): Promise<Danmu[]> {
  const key = String(id)
  if (cache.has(key)) return cache.get(key)!
  const data = await api('comments', key, signal)
  const items: Danmu[] = (data.comments || []).flatMap((item: { p?: string; m?: string }) => {
    const [time, mode, color] = (item.p || '').split(',').map(Number)
    if (!Number.isFinite(time) || !item.m) return []
    return [
      {
        text: item.m,
        time,
        mode: mode === 5 ? 1 : mode === 4 ? 2 : 0,
        color: '#' + (Number.isFinite(color) ? color : 16777215).toString(16).padStart(6, '0'),
      } as Danmu,
    ]
  })
  cache.set(key, items)
  return items
}
export function DanmuControls({
  art,
  title,
  episode,
  season,
}: {
  art: Artplayer | null
  title: string
  episode: number
  season: number
}) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem('oki-danmu-enabled') === 'true')
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [keyword, setKeyword] = useState(title)
  const [animes, setAnimes] = useState<Anime[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [selected, setSelected] = useState<Match | null>(null)
  const [manualId, setManualId] = useState<number | null>(null)
  const [retry, setRetry] = useState(0)
  const [opacity, setOpacity] = useState(() =>
    Number(localStorage.getItem('oki-danmu-opacity') || 0.8),
  )
  const [size, setSize] = useState(() => Number(localStorage.getItem('oki-danmu-size') || 25))
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    setKeyword(title)
    setManualId(null)
    setSelected(null)
    setAnimes([])
    setEpisodes([])
    setOffset(0)
  }, [title, season, episode])
  useEffect(() => {
    localStorage.setItem('oki-danmu-enabled', String(enabled))
  }, [enabled])
  useEffect(() => {
    if (!art) return
    let live = true
    const controller = new AbortController()
    const run = async () => {
      if (!enabled) {
        ;(art.plugins.artplayerPluginDanmuku as Result | undefined)?.hide()
        setStatus('')
        return
      }
      if (!title) return
      ;(art.plugins.artplayerPluginDanmuku as Result | undefined)?.hide()
      setStatus('弹幕加载中…')
      try {
        let id = manualId
        if (id == null) {
          const key =
            title + ' S' + String(season).padStart(2, '0') + 'E' + String(episode).padStart(2, '0')
          let match = matches.get(key)
          if (!match) {
            const data = await api('match', key, controller.signal)
            match = data.matches?.[0]
            if (match?.episodeId) matches.set(key, match)
          }
          if (!match?.episodeId) {
            if (live) setStatus('未找到弹幕，请手动搜索')
            return
          }
          id = match.episodeId
          if (live) setSelected(match)
        }
        const items = await comments(id, controller.signal)
        if (!live) return
        const adjusted = items.map(item => ({
          ...item,
          time: Math.max(0, (item.time || 0) + offset),
        }))
        let plugin = art.plugins.artplayerPluginDanmuku as Result | undefined
        if (!plugin) {
          await art.plugins.add(danmuku({ danmuku: [], emitter: false, synchronousPlayback: true }))
          plugin = art.plugins.artplayerPluginDanmuku as Result
        }
        if (!live || !plugin) return
        await plugin.load(adjusted)
        if (live) {
          plugin.config({
            ...plugin.option,
            opacity: Number(localStorage.getItem('oki-danmu-opacity') || 0.8),
            fontSize: Number(localStorage.getItem('oki-danmu-size') || 25),
          })
          plugin.show()
          setStatus(items.length ? '已加载 ' + items.length + ' 条弹幕' : '没有弹幕')
        }
      } catch {
        if (live) setStatus('弹幕加载失败，请重试')
      }
    }
    void run()
    return () => {
      live = false
      controller.abort()
    }
  }, [art, enabled, title, season, episode, manualId, retry, offset])
  useEffect(() => {
    localStorage.setItem('oki-danmu-opacity', String(opacity))
    localStorage.setItem('oki-danmu-size', String(size))
    const plugin = art?.plugins.artplayerPluginDanmuku as Result | undefined
    if (plugin) plugin.config({ ...plugin.option, opacity, fontSize: size })
  }, [art, opacity, size])
  if (!art?.template?.$player) return null
  const search = async () => {
    try {
      setStatus('搜索中…')
      const data = await api('search', keyword)
      setAnimes(data.animes || [])
      setEpisodes([])
      setStatus('请选择结果')
    } catch {
      setStatus('搜索失败')
    }
  }
  const choose = async (id: number) => {
    try {
      setStatus('加载剧集…')
      const data = await api('detail', String(id))
      setEpisodes(data.bangumi?.episodes || [])
      setStatus('请选择剧集')
    } catch {
      setStatus('剧集加载失败')
    }
  }
  return createPortal(
    <div
      className="absolute top-2 right-2 z-[40] text-sm text-white"
      onClick={event => event.stopPropagation()}
    >
      <button
        type="button"
        className="rounded bg-black/75 px-3 py-2"
        onClick={() => setOpen(!open)}
      >
        弹幕 {enabled ? '开' : '关'}
      </button>
      {open && (
        <div className="mt-1 max-h-[65vh] w-72 space-y-2 overflow-auto rounded bg-black/90 p-3">
          <label className="flex gap-2">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            启用弹幕
          </label>
          {enabled && (
            <>
              <div>{status}</div>
              {selected && (
                <div>
                  {selected.animeTitle} · {selected.episodeTitle}
                </div>
              )}
              <button type="button" onClick={() => setRetry(x => x + 1)}>
                重试
              </button>
              <label className="block">
                透明度{' '}
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={opacity}
                  onChange={e => setOpacity(Number(e.target.value))}
                />
              </label>
              <label className="block">
                字号{' '}
                <input
                  type="range"
                  min="14"
                  max="40"
                  value={size}
                  onChange={e => setSize(Number(e.target.value))}
                />
              </label>
              <label className="block">
                时间偏移（秒）{' '}
                <input
                  className="w-16 bg-gray-800"
                  type="number"
                  value={offset}
                  onChange={e => setOffset(Number(e.target.value))}
                />
              </label>
              <div className="flex gap-1">
                <input
                  className="min-w-0 flex-1 bg-gray-800 px-1"
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                />
                <button type="button" onClick={() => void search()}>
                  搜索
                </button>
              </div>
              {animes.map(a => (
                <button
                  className="block text-left"
                  type="button"
                  key={a.animeId}
                  onClick={() => void choose(a.animeId)}
                >
                  {a.animeTitle}
                </button>
              ))}
              {episodes.map(e => (
                <button
                  className="block text-left"
                  type="button"
                  key={e.episodeId}
                  onClick={() => {
                    setManualId(e.episodeId)
                    setSelected({
                      episodeId: e.episodeId,
                      animeTitle: keyword,
                      episodeTitle: e.episodeTitle,
                    })
                    setEpisodes([])
                    setAnimes([])
                  }}
                >
                  {e.episodeTitle}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>,
    art.template.$player,
  )
}
