/**
 * 弹幕排版与设备适配工具
 */
import { DANMAKU_FONT_SIZE_MIN, DANMAKU_FONT_SIZE_MAX } from '@/shared/config/danmaku'

/** 弹幕字号预设选项 */
export const DANMAKU_FONT_SIZE_PRESETS = [
  { label: '极小', value: 12 },
  { label: '小', value: 16 },
  { label: '中', value: 20 },
  { label: '标准', value: 25 },
  { label: '大', value: 30 },
  { label: '特大', value: 36 },
] as const

/**
 * 依据设备类型与播放器/视口宽度计算实际渲染的弹幕字号
 *
 * 手机竖屏（宽度 < 640px）：缩小至约 56%（默认 25px -> 14px），避免弹幕遮挡过大
 * 手机横屏/平板全屏（640px <= 宽度 < 1024px）：缩小至约 72%（默认 25px -> 18px）
 * 桌面大屏（宽度 >= 1024px）：保持用户原设置基准（默认 25px）
 */
export const getEffectiveDanmakuFontSize = (
  baseSize: number,
  options?: { containerWidth?: number; isMobile?: boolean },
): number => {
  const safeBase = Number.isFinite(baseSize) && baseSize > 0 ? baseSize : 25
  const width =
    options?.containerWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1920)
  const isMobile =
    options?.isMobile ??
    (typeof window !== 'undefined' &&
      (window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
        navigator.maxTouchPoints > 0 ||
        width < 768))

  if (!isMobile) {
    return Math.max(DANMAKU_FONT_SIZE_MIN, Math.min(DANMAKU_FONT_SIZE_MAX, Math.round(safeBase)))
  }

  if (width < 640) {
    return Math.max(DANMAKU_FONT_SIZE_MIN, Math.min(26, Math.round(safeBase * 0.56)))
  }
  if (width < 1024) {
    return Math.max(12, Math.min(32, Math.round(safeBase * 0.72)))
  }
  return Math.max(12, Math.min(DANMAKU_FONT_SIZE_MAX, Math.round(safeBase)))
}
