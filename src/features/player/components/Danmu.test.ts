import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type Artplayer from 'artplayer'
import type { Option } from 'artplayer-plugin-danmuku'
import { expect, it, vi } from 'vitest'
import { useSettingStore } from '@/shared/store/settingStore'
import { DanmuControls } from './Danmu'

it('preserves native panel settings across resize without saving rendered font sizes or reloading data', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      url.includes('action=match')
        ? { matches: [{ episodeId: 981, animeTitle: 'Regression', episodeTitle: '1' }] }
        : { comments: [{ p: '1,1,16777215', m: 'Test comment' }] },
  }))
  vi.stubGlobal('fetch', fetchMock)
  const previousState = useSettingStore.getState()
  useSettingStore.getState().setPlaybackSettings({
    isDanmakuEnabled: true,
    danmakuFontSize: 25,
    danmakuOpacity: 0.8,
    danmakuSpeed: 5,
    isDanmakuAntiOverlap: true,
  })
  const events = new Map<string, Set<(...args: unknown[]) => void>>()
  const emit = (name: string, ...args: unknown[]) => {
    events.get(name)?.forEach(listener => listener(...args))
  }
  const plugin = {
    option: { visible: true, fontSize: 14, opacity: 0.8, speed: 5, antiOverlap: true },
    config(options: Partial<Option>) {
      Object.assign(this.option, options)
      emit('artplayerPluginDanmuku:config', this.option)
    },
    hide() {
      this.option.visible = false
    },
    show() {
      this.option.visible = true
    },
    load: vi.fn(async () => {}),
  }
  const player = document.createElement('div')
  let width = 390
  Object.defineProperty(player, 'clientWidth', { get: () => width })
  const art = {
    plugins: { artplayerPluginDanmuku: plugin },
    template: { $player: player },
    on(name: string, listener: (...args: unknown[]) => void) {
      if (!events.has(name)) events.set(name, new Set())
      events.get(name)!.add(listener)
    },
    off(name: string, listener: (...args: unknown[]) => void) {
      events.get(name)?.delete(listener)
    },
    setting: { find: () => ({}), update: vi.fn() },
    controls: { add: vi.fn() },
  } as unknown as Artplayer
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        createElement(DanmuControls, {
          art,
          title: 'Regression',
          season: 1,
          episode: 1,
        }),
      ),
    )
    expect(plugin.load).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      plugin.config({ opacity: 0.3, speed: 8, antiOverlap: false })
      // Resize in the same turn, before React has rendered the store update.
      width = 844
      emit('resize')
    })
    expect(useSettingStore.getState().playback).toMatchObject({
      danmakuFontSize: 25,
      danmakuOpacity: 0.3,
      danmakuSpeed: 8,
      isDanmakuAntiOverlap: false,
    })
    expect(plugin.option).toMatchObject({
      fontSize: 18,
      opacity: 0.3,
      speed: 8,
      antiOverlap: false,
    })
    await act(async () => useSettingStore.getState().setPlaybackSettings({ danmakuFontSize: 30 }))
    expect(plugin.option.fontSize).toBe(22)
    expect(plugin.load).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  } finally {
    await act(async () => root.unmount())
    useSettingStore.setState(previousState)
    host.remove()
    vi.unstubAllGlobals()
  }
})
