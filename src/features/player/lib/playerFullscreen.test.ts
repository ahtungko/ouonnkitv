import Artplayer from 'artplayer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindWebFullscreen } from './playerFullscreen'

describe('body web fullscreen lifecycle', () => {
  let art: Artplayer
  let host: HTMLDivElement
  let cleanup: () => void
  const previousBodyMode = Artplayer.FULLSCREEN_WEB_IN_BODY

  beforeEach(() => {
    vi.useFakeTimers()
    Artplayer.LOG_VERSION = false
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    host = document.createElement('div')
    host.style.filter = 'blur(0px)'
    document.body.append(host)
    art = new Artplayer({ container: host, url: '', fullscreenWeb: true })
    cleanup = bindWebFullscreen(art)
  })

  afterEach(() => {
    cleanup()
    if (!art.isDestroy) art.destroy()
    host.remove()
    Artplayer.FULLSCREEN_WEB_IN_BODY = previousBodyMode
    vi.useRealTimers()
  })

  it('moves the complete player outside filtered ancestors and restores it on exit', () => {
    const player = art.template.$player
    const danmaku = art.template.$danmuku
    art.fullscreenWeb = true
    expect(player.parentElement).toBe(document.body)
    expect(player.contains(art.video)).toBe(true)
    expect(player.contains(danmaku)).toBe(true)
    expect(document.body.classList.contains('oki-fullscreen-web-active')).toBe(true)

    art.fullscreenWeb = false
    expect(player.parentElement).toBe(host)
    expect(document.body.classList.contains('oki-fullscreen-web-active')).toBe(false)
  })

  it('restores an active fullscreen before destroy(false) so no player is left in body', () => {
    const player = art.template.$player
    art.fullscreenWeb = true
    cleanup()
    expect(player.parentElement).toBe(host)
    expect(art.fullscreenWeb).toBe(false)
    expect(document.body.classList.contains('oki-fullscreen-web-active')).toBe(false)
    art.destroy(false)
    host.remove()
    expect(player.isConnected).toBe(false)
  })
})
