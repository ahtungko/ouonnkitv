import { useEffect, useRef, useState } from 'react'
import type Artplayer from 'artplayer'
import danmuku, { type Danmu, type Option, type Result } from 'artplayer-plugin-danmuku'
import { useSettingStore } from '@/shared/store/settingStore'
import { getEffectiveDanmakuFontSize, DANMAKU_FONT_SIZE_PRESETS } from '../lib/danmakuUtils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { MessageSquare, RotateCw, Search, Sliders } from 'lucide-react'

type SettingOption = {
  name?: string
  html?: string | HTMLElement
  tooltip?: string | HTMLElement
  switch?: boolean
  [key: string]: unknown
}

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

async function comments(id: number, signal?: AbortSignal): Promise<Danmu[]> {
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

const createSafeTooltip = (text: string): HTMLElement => {
  const span = document.createElement('span')
  span.textContent = text
  return span
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
  const { playback, setPlaybackSettings } = useSettingStore()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [keyword, setKeyword] = useState(title)
  const [animes, setAnimes] = useState<Anime[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [selected, setSelected] = useState<Match | null>(null)
  const [manualId, setManualId] = useState<number | null>(null)
  const [retry, setRetry] = useState(0)
  const [offset, setOffset] = useState(0)
  const [danmakuCount, setDanmakuCount] = useState(0)

  const isEnabledRef = useRef(playback.isDanmakuEnabled)
  isEnabledRef.current = playback.isDanmakuEnabled
  const fontSizeRef = useRef(playback.danmakuFontSize)
  fontSizeRef.current = playback.danmakuFontSize
  const opacityRef = useRef(playback.danmakuOpacity)
  opacityRef.current = playback.danmakuOpacity
  const speedRef = useRef(playback.danmakuSpeed)
  speedRef.current = playback.danmakuSpeed
  const antiOverlapRef = useRef(playback.isDanmakuAntiOverlap)
  antiOverlapRef.current = playback.isDanmakuAntiOverlap
  const isInternalUpdateRef = useRef(false)

  const openMatchingDialog = () => {
    if (art?.fullscreen) art.fullscreen = false
    if (art?.fullscreenWeb) art.fullscreenWeb = false
    setOpen(true)
  }

  // 剧集变化时重置搜索与手动匹配状态
  useEffect(() => {
    setKeyword(title)
    setManualId(null)
    setSelected(null)
    setAnimes([])
    setEpisodes([])
    setOffset(0)
    setDanmakuCount(0)
  }, [title, season, episode])

  // 监听 ArtPlayer 弹幕插件内置控制栏/配置事件，保持 store 同步
  useEffect(() => {
    if (!art) return
    const onConfig = (option: Option) => {
      if (isInternalUpdateRef.current) return
      // fontSize 是缩放后的渲染字号，不能写回基准字号；其余设置保持双向同步。
      const updates: Parameters<typeof setPlaybackSettings>[0] = {}
      if (typeof option?.visible === 'boolean' && option.visible !== isEnabledRef.current) {
        updates.isDanmakuEnabled = option.visible
        isEnabledRef.current = option.visible
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('oki-danmu-enabled', String(option.visible))
        }
        try {
          art.setting.update({
            name: 'danmaku-switch',
            html: '弹幕',
            switch: option.visible,
            tooltip: option.visible ? '开启' : '关闭',
          })
        } catch {}
      }
      if (typeof option?.opacity === 'number' && option.opacity !== opacityRef.current) {
        updates.danmakuOpacity = option.opacity
        opacityRef.current = option.opacity
      }
      if (typeof option?.speed === 'number' && option.speed !== speedRef.current) {
        updates.danmakuSpeed = option.speed
        speedRef.current = option.speed
      }
      if (typeof option?.antiOverlap === 'boolean' && option.antiOverlap !== antiOverlapRef.current) {
        updates.isDanmakuAntiOverlap = option.antiOverlap
        antiOverlapRef.current = option.antiOverlap
      }
      if (Object.keys(updates).length > 0) setPlaybackSettings(updates)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    art.on('artplayerPluginDanmuku:config' as any, onConfig)
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      art.off('artplayerPluginDanmuku:config' as any, onConfig)
    }
  }, [art, setPlaybackSettings])

  // 注册 Artplayer setting 菜单项与控制栏按钮
  useEffect(() => {
    if (!art) return

    // 1. 设置菜单里的弹幕开关
    try {
      if (!art.setting.find('danmaku-switch')) {
        art.setting.add({
          name: 'danmaku-switch',
          html: '弹幕',
          tooltip: playback.isDanmakuEnabled ? '开启' : '关闭',
          icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/></svg>',
          switch: playback.isDanmakuEnabled,
          onSwitch: function (item: SettingOption) {
            const next = !item.switch
            const plugin = art.plugins.artplayerPluginDanmuku as Result | undefined
            if (plugin) {
              isInternalUpdateRef.current = true
              plugin.config({ ...plugin.option, visible: next })
              isInternalUpdateRef.current = false
            }
            item.tooltip = next ? '开启' : '关闭'
            setPlaybackSettings({ isDanmakuEnabled: next })
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('oki-danmu-enabled', String(next))
            }
            return next
          },
        })
      } else {
        art.setting.update({
          name: 'danmaku-switch',
          html: '弹幕',
          switch: playback.isDanmakuEnabled,
          tooltip: playback.isDanmakuEnabled ? '开启' : '关闭',
        })
      }
    } catch {}

    // 2. 设置菜单里的弹幕匹配与搜索（使用 textContent 避免 HTML 注入）
    try {
      const matchTipText = selected
        ? `${selected.animeTitle} · ${selected.episodeTitle}`
        : danmakuCount > 0
          ? `${danmakuCount} 条弹幕`
          : '点击匹配/换源'
      const safeTooltip = createSafeTooltip(matchTipText)

      if (!art.setting.find('danmaku-match')) {
        art.setting.add({
          name: 'danmaku-match',
          html: '弹幕搜索与匹配',
          tooltip: safeTooltip,
          icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
          onClick: function () {
            art.setting.show = false
            openMatchingDialog()
          },
        })
      } else {
        art.setting.update({
          name: 'danmaku-match',
          html: '弹幕搜索与匹配',
          tooltip: safeTooltip,
        })
      }
    } catch {}

    // 3. 设置菜单里的弹幕字号调节
    try {
      const currentSize = playback.danmakuFontSize
      const currentPreset = DANMAKU_FONT_SIZE_PRESETS.find(p => p.value === currentSize)
      const sizeTooltip = currentPreset ? `${currentPreset.label} (${currentSize}px)` : `${currentSize}px`

      if (!art.setting.find('danmaku-size')) {
        art.setting.add({
          name: 'danmaku-size',
          html: '弹幕字号',
          tooltip: sizeTooltip,
          icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
          selector: DANMAKU_FONT_SIZE_PRESETS.map(preset => ({
            html: `${preset.label} (${preset.value}px)`,
            value: preset.value,
            default: preset.value === currentSize,
          })),
          onSelect: function (item: SettingOption) {
            const val = Number(item.value)
            if (Number.isFinite(val)) {
              setPlaybackSettings({ danmakuFontSize: val })
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem('oki-danmu-size', String(val))
              }
            }
          },
        })
      } else {
        art.setting.update({
          name: 'danmaku-size',
          html: '弹幕字号',
          tooltip: sizeTooltip,
          selector: DANMAKU_FONT_SIZE_PRESETS.map(preset => ({
            html: `${preset.label} (${preset.value}px)`,
            value: preset.value,
            default: preset.value === currentSize,
          })),
        })
      }
    } catch {}

    // 4. 右侧控制栏弹幕匹配入口
    try {
      const tooltip = danmakuCount > 0 ? `弹幕匹配与搜索 (${danmakuCount}条)` : '弹幕匹配与搜索'
      if (!art.controls['danmaku-search']) {
        art.controls.add({
          name: 'danmaku-search',
          position: 'right',
          index: 12,
          html: `<span class="art-icon" style="display:flex;align-items:center;justify-content:center;position:relative;width:100%;height:100%;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/></svg></span>`,
          tooltip,
          click: () => {
            openMatchingDialog()
          },
        })
      } else {
        const el = art.controls['danmaku-search'] as HTMLElement | undefined
        if (el) {
          el.dataset.tooltip = tooltip
        }
      }
    } catch {}
  }, [
    art,
    playback.isDanmakuEnabled,
    playback.danmakuFontSize,
    selected,
    danmakuCount,
    setPlaybackSettings,
  ])

  // 同步设置项（透明度、字号、滚动速度、防重叠）到弹幕插件，并监听 resize 自适应移动端排版
  useEffect(() => {
    if (!art) return
    const updateDanmakuConfig = () => {
      const plugin = art.plugins.artplayerPluginDanmuku as Result | undefined
      if (!plugin) return
      const effectiveFontSize = getEffectiveDanmakuFontSize(fontSizeRef.current, {
        containerWidth: art.template.$player?.clientWidth,
      })
      isInternalUpdateRef.current = true
      plugin.config({
        ...plugin.option,
        opacity: opacityRef.current,
        fontSize: effectiveFontSize,
        speed: speedRef.current,
        antiOverlap: antiOverlapRef.current,
        visible: isEnabledRef.current,
      })
      isInternalUpdateRef.current = false
    }

    updateDanmakuConfig()

    art.on('resize', updateDanmakuConfig)
    return () => {
      art.off('resize', updateDanmakuConfig)
    }
  }, [
    art,
    playback.danmakuOpacity,
    playback.danmakuFontSize,
    playback.danmakuSpeed,
    playback.isDanmakuAntiOverlap,
    playback.isDanmakuEnabled,
  ])

  // 弹幕检索与加载逻辑
  useEffect(() => {
    if (!art) return
    let live = true
    const controller = new AbortController()

    const run = async () => {
      const plugin = art.plugins.artplayerPluginDanmuku as Result | undefined
      if (!playback.isDanmakuEnabled) {
        plugin?.hide()
        setStatus('')
        return
      }
      if (!title) return

      plugin?.hide()
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
            if (live) {
              setStatus('未找到弹幕，可点击搜索手动匹配')
              setDanmakuCount(0)
            }
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

        let danmakuPlugin = art.plugins.artplayerPluginDanmuku as Result | undefined
        const effectiveFontSize = getEffectiveDanmakuFontSize(fontSizeRef.current, {
          containerWidth: art.template.$player?.clientWidth,
        })
        if (!danmakuPlugin) {
          await art.plugins.add(
            danmuku({
              danmuku: [],
              speed: speedRef.current,
              opacity: opacityRef.current,
              fontSize: effectiveFontSize,
              antiOverlap: antiOverlapRef.current,
              synchronousPlayback: true,
              visible: isEnabledRef.current,
              emitter: false,
            }),
          )
          danmakuPlugin = art.plugins.artplayerPluginDanmuku as Result
        }
        if (!live || !danmakuPlugin) return

        await danmakuPlugin.load(adjusted)
        if (live) {
          isInternalUpdateRef.current = true
          danmakuPlugin.config({
            ...danmakuPlugin.option,
            opacity: opacityRef.current,
            fontSize: effectiveFontSize,
            speed: speedRef.current,
            antiOverlap: antiOverlapRef.current,
            visible: true,
          })
          isInternalUpdateRef.current = false
          danmakuPlugin.show()
          setDanmakuCount(items.length)
          setStatus(items.length ? `已加载 ${items.length} 条弹幕` : '当前剧集暂无弹幕')
        }
      } catch {
        if (live) {
          setStatus('弹幕加载失败，请重试')
          setDanmakuCount(0)
        }
      }
    }

    void run()
    return () => {
      live = false
      controller.abort()
    }
  }, [
    art,
    playback.isDanmakuEnabled,
    title,
    season,
    episode,
    manualId,
    retry,
    offset,
  ])

  const search = async () => {
    try {
      setStatus('搜索中…')
      const data = await api('search', keyword)
      setAnimes(data.animes || [])
      setEpisodes([])
      setStatus('请选择对应作品')
    } catch {
      setStatus('搜索失败，请检查网络')
    }
  }

  const choose = async (id: number) => {
    try {
      setStatus('加载剧集列表中…')
      const data = await api('detail', String(id))
      setEpisodes(data.bangumi?.episodes || [])
      setStatus('请选择剧集')
    } catch {
      setStatus('剧集加载失败')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md bg-zinc-900 border-zinc-800 text-white shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <MessageSquare className="size-4 text-violet-400" />
            弹幕匹配与时间轴校准
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-xs">
            检索弹幕源或微调弹幕出现时间。弹幕开关与基础显示设置已集成至播放器控制栏与播放设置中。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* 当前匹配状态信息卡 */}
          <div className="rounded-lg bg-zinc-800/60 p-3 space-y-1.5 border border-zinc-700/50">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">当前状态</span>
              <span className="font-medium text-zinc-200">{status || '就绪'}</span>
            </div>
            {selected && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">匹配动画</span>
                <span className="font-medium text-violet-300 truncate max-w-[220px]">
                  {selected.animeTitle} · {selected.episodeTitle}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-zinc-400">已载弹幕</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-emerald-400">
                  {danmakuCount} 条
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700 gap-1"
                  onClick={() => setRetry(x => x + 1)}
                >
                  <RotateCw className="size-3" />
                  重新加载
                </Button>
              </div>
            </div>
          </div>

          {/* 时间轴偏移调节 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300 font-medium flex items-center gap-1.5">
                <Sliders className="size-3.5 text-zinc-400" />
                时间轴偏移（秒）
              </span>
              <span className="text-zinc-400 font-mono">
                {offset > 0 ? `+${offset}s` : `${offset}s`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-12 text-xs bg-zinc-800 hover:bg-zinc-700 border-zinc-700"
                onClick={() => setOffset(o => o - 1)}
              >
                -1s
              </Button>
              <Input
                type="number"
                step="0.5"
                value={offset}
                onChange={e => setOffset(Number(e.target.value) || 0)}
                className="h-8 bg-zinc-800/80 border-zinc-700 text-center font-mono text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-12 text-xs bg-zinc-800 hover:bg-zinc-700 border-zinc-700"
                onClick={() => setOffset(o => o + 1)}
              >
                +1s
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs text-zinc-400 hover:text-white"
                onClick={() => setOffset(0)}
              >
                复位
              </Button>
            </div>
          </div>

          {/* 手动换源搜索 */}
          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <span className="text-xs text-zinc-300 font-medium flex items-center gap-1.5">
              <Search className="size-3.5 text-zinc-400" />
              手动搜索匹配
            </span>
            <div className="flex gap-2">
              <Input
                className="h-8 bg-zinc-800/80 border-zinc-700 text-xs"
                placeholder="输入动画名称进行精确搜索..."
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void search()
                }}
              />
              <Button
                size="sm"
                className="h-8 px-3 bg-violet-600 hover:bg-violet-500 text-white text-xs shrink-0"
                onClick={() => void search()}
              >
                搜索
              </Button>
            </div>

            {animes.length > 0 && (
              <div className="max-h-36 overflow-y-auto space-y-1 rounded border border-zinc-800 bg-zinc-950/40 p-1.5">
                <div className="text-[11px] text-zinc-400 px-1 py-0.5">选择对应作品：</div>
                {animes.map(a => (
                  <button
                    key={a.animeId}
                    type="button"
                    className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-zinc-800 text-zinc-200 truncate transition-colors"
                    onClick={() => void choose(a.animeId)}
                  >
                    {a.animeTitle}
                  </button>
                ))}
              </div>
            )}

            {episodes.length > 0 && (
              <div className="max-h-36 overflow-y-auto space-y-1 rounded border border-zinc-800 bg-zinc-950/40 p-1.5">
                <div className="text-[11px] text-zinc-400 px-1 py-0.5">选择剧集：</div>
                <div className="grid grid-cols-2 gap-1">
                  {episodes.map(e => (
                    <button
                      key={e.episodeId}
                      type="button"
                      className="text-left px-2 py-1.5 text-xs rounded hover:bg-zinc-800 text-zinc-200 truncate transition-colors"
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
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
