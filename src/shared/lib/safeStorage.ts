import type { StateStorage } from 'zustand/middleware'

/**
 * 判断是否为 LocalStorage 空间超限错误 (QuotaExceededError)
 */
export function isQuotaExceededError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return (
      err.code === 22 ||
      err.code === 1014 ||
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    )
  }
  if (typeof err === 'object' && err !== null) {
    const error = err as { name?: string; message?: string }
    return (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      (typeof error.message === 'string' && error.message.toLowerCase().includes('quota'))
    )
  }
  return false
}

/**
 * 紧急存储空间释放策略
 * 当 localStorage 达到浏览器上限 (通常为 5MB) 时，自动清理可重建的临时缓存
 */
export function runEmergencyStorageCleanup(failingKey?: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false

  let reclaimed = false

  // 1. 优先清理 TMDB 匹配缓存 (纯搜索匹配结果，可随时自动重新匹配)
  if (failingKey !== 'ouonnki-tv-tmdb-match-cache-store') {
    try {
      if (localStorage.getItem('ouonnki-tv-tmdb-match-cache-store')) {
        localStorage.removeItem('ouonnki-tv-tmdb-match-cache-store')
        reclaimed = true
      }
    } catch {
      // 忽略
    }
  }

  // 2. 清理搜索历史记录 (非核心用户数据)
  if (failingKey !== 'ouonnki-tv-search-store') {
    try {
      if (localStorage.getItem('ouonnki-tv-search-store')) {
        localStorage.removeItem('ouonnki-tv-search-store')
        reclaimed = true
      }
    } catch {
      // 忽略
    }
  }

  // 3. 压缩追剧更新缓存 (仅保留前 10 条活跃更新)
  if (failingKey !== 'ouonnki-tv-series-updates') {
    try {
      const updatesRaw = localStorage.getItem('ouonnki-tv-series-updates')
      if (updatesRaw) {
        const parsed = JSON.parse(updatesRaw)
        if (parsed?.state?.entries && Object.keys(parsed.state.entries).length > 10) {
          const keys = Object.keys(parsed.state.entries).slice(0, 10)
          parsed.state.entries = Object.fromEntries(keys.map(k => [k, parsed.state.entries[k]]))
          localStorage.setItem('ouonnki-tv-series-updates', JSON.stringify(parsed))
          reclaimed = true
        }
      }
    } catch {
      // 忽略
    }
  }

  // 4. 压缩观看历史 (仅保留最新的 25 条)
  if (failingKey !== 'ouonnki-tv-viewing-history') {
    try {
      const historyRaw = localStorage.getItem('ouonnki-tv-viewing-history')
      if (historyRaw) {
        const parsed = JSON.parse(historyRaw)
        if (Array.isArray(parsed?.state?.viewingHistory) && parsed.state.viewingHistory.length > 25) {
          parsed.state.viewingHistory = parsed.state.viewingHistory.slice(0, 25)
          localStorage.setItem('ouonnki-tv-viewing-history', JSON.stringify(parsed))
          reclaimed = true
        }
      }
    } catch {
      // 忽略
    }
  }

  return reclaimed
}

/**
 * 具备防爆限配额保护与自愈特性的 LocalStorage 存储器
 */
export const safeLocalStorage: StateStorage = {
  getItem: (name: string): string | null => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null
      return localStorage.getItem(name)
    } catch (err) {
      console.warn(`[SafeStorage] 读取 "${name}" 失败:`, err)
      return null
    }
  },

  setItem: (name: string, value: string): void => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return
      localStorage.setItem(name, value)
    } catch (err) {
      if (isQuotaExceededError(err)) {
        console.warn(`[SafeStorage] LocalStorage 配额超限 ("${name}")，正在执行紧急缓存空间释放...`)
        const reclaimed = runEmergencyStorageCleanup(name)
        if (reclaimed) {
          try {
            localStorage.setItem(name, value)
            console.info(`[SafeStorage] 紧急空间释放成功，已保存 "${name}"。`)
            return
          } catch (retryErr) {
            console.error(`[SafeStorage] 空间释放后写入 "${name}" 仍超出限额:`, retryErr)
          }
        }
        return
      }
      console.error(`[SafeStorage] 写入 "${name}" 发生未知错误:`, err)
    }
  },

  removeItem: (name: string): void => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return
      localStorage.removeItem(name)
    } catch (err) {
      console.warn(`[SafeStorage] 移除 "${name}" 失败:`, err)
    }
  },
}
