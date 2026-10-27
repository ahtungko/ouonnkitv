import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useSettingStore } from '@/shared/store/settingStore'
import { personalConfigSchema } from '@/shared/hooks/usePersonalConfig'
import PlaybackSettings from './index'

it.each([10, 11, 45, 50])(
  'preserves imported font size %i after focusing and leaving the input',
  async size => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const previousState = useSettingStore.getState()
    const imported = personalConfigSchema.parse({
      settings: { playback: { danmakuFontSize: size } },
      videoSources: [],
    })
    useSettingStore.getState().setPlaybackSettings(imported.settings.playback!)
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    try {
      await act(async () => root.render(createElement(PlaybackSettings)))
      const input = host.querySelector<HTMLInputElement>('[aria-label="弹幕基准字号"]')!
      expect(input.min).toBe('10')
      expect(input.max).toBe('50')
      expect(input.value).toBe(String(size))
      await act(async () => {
        input.focus()
        input.blur()
      })
      expect(useSettingStore.getState().playback.danmakuFontSize).toBe(size)
      expect(input.value).toBe(String(size))
    } finally {
      await act(async () => root.unmount())
      useSettingStore.setState(previousState)
      host.remove()
      vi.unstubAllGlobals()
    }
  },
)
