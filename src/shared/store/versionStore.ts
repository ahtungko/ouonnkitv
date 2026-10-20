import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

export interface VersionLink {
  label: string
  href: string
}

export interface VersionUpdate {
  version: string
  title: string
  date: string
  features: string[]
  fixes?: string[]
  breaking?: string[]
  links?: VersionLink[]
}

interface VersionState {
  // 当前版本
  currentVersion: string
  // 最后查看的版本
  lastViewedVersion: string
  // 是否显示更新弹窗
  showUpdateModal: boolean
  // 更新历史
  updateHistory: VersionUpdate[]
}

interface VersionActions {
  // 设置当前版本
  setCurrentVersion: (version: string) => void
  // 标记版本已查看
  markVersionAsViewed: (version: string) => void
  // 显示/隐藏更新弹窗
  setShowUpdateModal: (show: boolean) => void
  // 检查是否有新版本
  hasNewVersion: () => boolean
  // 获取最新的更新信息
  getLatestUpdate: () => VersionUpdate | null
}

type VersionStore = VersionState & VersionActions

// 格式化日期
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }
  return date.toLocaleDateString('zh-CN', options)
}

// 本站更新记录；上游历史见项目来源链接。
const VERSION_UPDATES: VersionUpdate[] = [
  {
    version: '2.1.0',
    title: 'xkaTV 账号同步、追剧提醒与站内公告',
    date: formatDate('2026-10-20'),
    features: [
      '账号登录与管理员中心，支持账号管理、跨设备同步和播放会话控制。',
      '收藏追剧支持按季绑定资源、检查新集、校准观看进度及跨设备已读同步。',
      '站内公告支持普通公告、维护通知和版本更新，新公告自动弹窗，播放期间延后提醒。',
      '维护按服务器时间自动开始和结束，管理员可正常访问，普通用户到时自动恢复。',
      '关于项目、反馈入口和文档统一为 xkaTV，由 ahtungko 维护。',
    ],
    fixes: [
      '兼容视频源及旧缓存中的数字资源 ID，修复登录加载时的校验异常。',
      '修复公告同版本重新加载无法丢弃草稿的问题，完善维护时间与表单校验。',
    ],
    links: [
      { label: '项目仓库', href: 'https://github.com/ahtungko/ouonnkitv' },
      { label: '问题反馈', href: 'https://github.com/ahtungko/ouonnkitv/issues' },
    ],
  },
]

// 获取最新版本号
const LATEST_VERSION = VERSION_UPDATES[0]?.version || '1.0.0'

export const useVersionStore = create<VersionStore>()(
  devtools(
    persist(
      immer<VersionStore>((set, get) => ({
        // 初始状态
        currentVersion: LATEST_VERSION,
        lastViewedVersion: '1.0.0',
        showUpdateModal: false,
        updateHistory: VERSION_UPDATES,

        // Actions
        setCurrentVersion: (version: string) => {
          set(state => {
            state.currentVersion = version
          })
        },

        markVersionAsViewed: (version: string) => {
          set(state => {
            state.lastViewedVersion = version
            state.showUpdateModal = false
          })
        },

        setShowUpdateModal: (show: boolean) => {
          set(state => {
            state.showUpdateModal = show
          })
        },

        hasNewVersion: () => {
          const state = get()
          return state.currentVersion !== state.lastViewedVersion
        },

        getLatestUpdate: () => {
          const state = get()
          // 找到当前版本对应的更新信息
          return state.updateHistory.find(update => update.version === state.currentVersion) || null
        },
      })),
      {
        name: 'ouonnki-tv-version-store',
        version: 1,
        partialize: state => ({
          lastViewedVersion: state.lastViewedVersion,
        }),
      },
    ),
    {
      name: 'VersionStore',
    },
  ),
)
