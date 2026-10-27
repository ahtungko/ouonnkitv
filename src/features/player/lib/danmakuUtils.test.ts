import { afterEach, describe, expect, it, vi } from 'vitest'
import { getEffectiveDanmakuFontSize } from './danmakuUtils'
import { personalConfigSchema } from '@/shared/hooks/usePersonalConfig'

describe('danmakuUtils', () => {
  afterEach(() => vi.unstubAllGlobals())
  describe('getEffectiveDanmakuFontSize', () => {
    it('returns original base size on desktop wide screen', () => {
      expect(getEffectiveDanmakuFontSize(25, { containerWidth: 1920, isMobile: false })).toBe(25)
      expect(getEffectiveDanmakuFontSize(16, { containerWidth: 1280, isMobile: false })).toBe(16)
      expect(getEffectiveDanmakuFontSize(30, { containerWidth: 1080, isMobile: false })).toBe(30)
    })

    it('scales down font size on mobile portrait (<640px)', () => {
      // 25 * 0.56 = 14
      expect(getEffectiveDanmakuFontSize(25, { containerWidth: 390, isMobile: true })).toBe(14)
      // 20 * 0.56 = 11.2 -> 11
      expect(getEffectiveDanmakuFontSize(20, { containerWidth: 414, isMobile: true })).toBe(11)
      // clamped minimum to 10
      expect(getEffectiveDanmakuFontSize(12, { containerWidth: 375, isMobile: true })).toBe(10)
    })

    it('scales down moderately on mobile landscape / compact tablets (640px - 1023px)', () => {
      // 25 * 0.72 = 18
      expect(getEffectiveDanmakuFontSize(25, { containerWidth: 844, isMobile: true })).toBe(18)
      // 30 * 0.72 = 21.6 -> 22
      expect(getEffectiveDanmakuFontSize(30, { containerWidth: 932, isMobile: true })).toBe(22)
    })

    it('handles invalid or non-finite base size safely', () => {
      // Defaults to 25 -> scaled on mobile portrait = 14
      expect(getEffectiveDanmakuFontSize(Number.NaN, { containerWidth: 390, isMobile: true })).toBe(14)
      expect(getEffectiveDanmakuFontSize(0, { containerWidth: 1920, isMobile: false })).toBe(25)
    })
  })

  describe('personalConfigSchema danmakuFontSize range alignment', () => {
    it('accepts danmakuFontSize between 10 and 50 when importing personal config', () => {
      const validPayload = (fontSize: number) => ({
        version: '1.0',
        exportedAt: '2026-10-27T00:00:00.000Z',
        settings: {
          playback: {
            danmakuFontSize: fontSize,
          },
        },
        videoSources: [],
      })

      // 10 and 11 should now be successfully accepted (previously failed with min(12))
      expect(personalConfigSchema.safeParse(validPayload(10)).success).toBe(true)
      expect(personalConfigSchema.safeParse(validPayload(11)).success).toBe(true)
      expect(personalConfigSchema.safeParse(validPayload(25)).success).toBe(true)
      expect(personalConfigSchema.safeParse(validPayload(40)).success).toBe(true)
      expect(personalConfigSchema.safeParse(validPayload(50)).success).toBe(true)

      // Values strictly outside 10..50 should be rejected
      expect(personalConfigSchema.safeParse(validPayload(9)).success).toBe(false)
      expect(personalConfigSchema.safeParse(validPayload(51)).success).toBe(false)
    })
  })
})
