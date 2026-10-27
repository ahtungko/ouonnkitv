import Artplayer from 'artplayer'

/** Keep fixed positioning outside the route animation's filter/scroll containers. */
export function bindWebFullscreen(art: Artplayer): () => void {
  Artplayer.FULLSCREEN_WEB_IN_BODY = true

  const onChange = (active: boolean) => {
    document.body.classList.toggle('oki-fullscreen-web-active', active)
  }
  art.on('fullscreenWeb', onChange)

  return () => {
    // Restore the player before destroy(false), otherwise it remains attached to body.
    if (art.fullscreenWeb) art.fullscreenWeb = false
    art.off('fullscreenWeb', onChange)
    document.body.classList.remove('oki-fullscreen-web-active')
  }
}
