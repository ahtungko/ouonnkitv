import { useState } from 'react'
import { getPublicEnv } from '@/shared/config/runtimeEnv'
import { useSettingStore } from '@/shared/store/settingStore'
import { useApiStore } from '@/shared/store/apiStore'
import { useAuthStore } from '@/shared/store/authStore'
import { syncClient } from '@/shared/sync/client'
import { useTmdbEnabled } from '@/shared/hooks/useTmdbMode'
import { clearBusinessCaches } from '@/shared/lib/cache/businessCache'
import { ConfirmModal } from '@/shared/components/common/ConfirmModal'
import { Switch } from '@/shared/components/ui/switch'
import { Input } from '@/shared/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { toast } from 'sonner'
import {
  Database,
  Gauge,
  ListFilter,
  MessageSquare,
  Monitor,
  Palette,
  PlaySquare,
  Settings2,
  Timer,
  Trash2,
  Volume2,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { SettingsItem, SettingsPageShell, SettingsSection } from '../common'

export default function PlaybackSettings() {
  const account = useAuthStore(state => state.account)
  const isAdmin = !syncClient || account?.role === 'admin'
  const { playback, setPlaybackSettings } = useSettingStore()
  const { adFilteringEnabled, setAdFilteringEnabled } = useApiStore()
  const tmdbEnabled = useTmdbEnabled()
  const [confirmClearCacheOpen, setConfirmClearCacheOpen] = useState(false)

  const envApiBase = getPublicEnv('OKI_DANDAN_API_BASE_URL')
  const envAppId = getPublicEnv('OKI_DANDAN_APP_ID')
  const envAppSecret = getPublicEnv('OKI_DANDAN_APP_SECRET')

  return (
    <SettingsPageShell
      title="播放设置"
      description="按你的观看习惯组合播放行为与剧集展示方式。"
      showHeader={false}
    >
      <SettingsSection
        title="播放行为"
        description="控制自动续播、观看记录和广告片段过滤。"
        icon={<PlaySquare className="size-4" />}
        tone="violet"
      >
        <SettingsItem
          title="开启观看记录"
          description="自动记录您的观看进度，便于下次续播。"
          controlClassName="self-end mt-1"
          control={
            <Switch
              checked={playback.isViewingHistoryEnabled}
              onCheckedChange={checked => setPlaybackSettings({ isViewingHistoryEnabled: checked })}
            />
          }
        />
        <SettingsItem
          title="详情页显示观看进度"
          description="在媒体详情页展示已观看剧集与当前进度。"
          controlClassName="self-end mt-1"
          control={
            <Switch
              checked={playback.isViewingHistoryVisible}
              onCheckedChange={checked => setPlaybackSettings({ isViewingHistoryVisible: checked })}
            />
          }
        />
        <SettingsItem
          title="自动续播下一集"
          description="当前一集播放完毕后自动切换到下一集。"
          controlClassName="self-end mt-1"
          control={
            <Switch
              checked={playback.isAutoPlayEnabled}
              onCheckedChange={checked => setPlaybackSettings({ isAutoPlayEnabled: checked })}
            />
          }
        />
        <SettingsItem
          title="跳过切片广告"
          description="尝试检测并跳过 #EXT-X-DISCONTINUITY 标记的广告片段。"
          controlClassName="self-end mt-1"
          control={
            <Switch
              checked={adFilteringEnabled}
              onCheckedChange={checked => setAdFilteringEnabled(checked)}
            />
          }
        />
      </SettingsSection>

      <SettingsSection
        title="播放器外观"
        description="自定义播放器的默认音量、主题色和记录上限。"
        icon={<Monitor className="size-4" />}
        tone="cyan"
      >
        <SettingsItem
          title="默认音量"
          description="新播放页的初始音量（0~1），修改后下次打开播放页生效。"
          control={
            <div className="relative w-full sm:w-48">
              <Volume2 className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                type="number"
                min={0}
                max={1}
                step={0.1}
                className="pl-9"
                value={playback.defaultVolume}
                onChange={e => {
                  const val = Number.parseFloat(e.target.value)
                  if (!Number.isNaN(val)) {
                    setPlaybackSettings({ defaultVolume: Math.min(1, Math.max(0, val)) })
                  }
                }}
              />
            </div>
          }
        />
        <SettingsItem
          title="播放器主题色"
          description="进度条、高亮等 UI 元素的颜色，下次打开播放页生效。"
          control={
            <div className="flex items-center gap-2">
              <Palette className="text-muted-foreground size-4" />
              <input
                type="color"
                className="size-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                value={playback.playerThemeColor}
                onChange={e => setPlaybackSettings({ playerThemeColor: e.target.value })}
              />
              <span className="text-muted-foreground text-xs">{playback.playerThemeColor}</span>
            </div>
          }
        />
        <SettingsItem
          title="观看历史上限"
          description="最多保留的观看记录条数，超出后自动清除最早的记录。"
          control={
            <div className="w-full sm:w-48">
              <Input
                type="number"
                min={10}
                max={500}
                step={10}
                value={playback.maxViewingHistoryCount}
                onChange={e =>
                  setPlaybackSettings({
                    maxViewingHistoryCount: Number.parseInt(e.target.value, 10) || 50,
                  })
                }
              />
            </div>
          }
        />
      </SettingsSection>

      <SettingsSection
        title="播放器功能"
        description="控制播放器内置功能的启用状态，修改后下次打开播放页生效。"
        icon={<Settings2 className="size-4" />}
        tone="rose"
      >
        <SettingsItem
          title="循环播放"
          description="单集播放完毕后自动重头开始。"
          controlClassName="self-end mt-1"
          control={
            <Switch
              checked={playback.isLoopEnabled}
              onCheckedChange={checked => setPlaybackSettings({ isLoopEnabled: checked })}
            />
          }
        />
        <SettingsItem
          title="画中画"
          description="允许将视频以悬浮小窗形式播放。"
          controlClassName="self-end mt-1"
          control={
            <Switch
              checked={playback.isPipEnabled}
              onCheckedChange={checked => setPlaybackSettings({ isPipEnabled: checked })}
            />
          }
        />
        <SettingsItem
          title="自动迷你播放器"
          description="页面滚动时自动将视频缩小为迷你播放器。"
          controlClassName="self-end mt-1"
          control={
            <Switch
              checked={playback.isAutoMiniEnabled}
              onCheckedChange={checked => setPlaybackSettings({ isAutoMiniEnabled: checked })}
            />
          }
        />
        <SettingsItem
          title="移动端手势操作"
          description="仅在移动端网页全屏下启用滑动、双击和长按手势。"
          controlClassName="self-end mt-1"
          control={
            <Switch
              checked={playback.isMobileGestureEnabled}
              onCheckedChange={checked => setPlaybackSettings({ isMobileGestureEnabled: checked })}
            />
          }
        />
        <SettingsItem
          title="长按倍速倍率"
          description="设置移动端长按时的播放倍率，范围 1~5，支持 0.5 步进。"
          control={
            <div className="relative w-full sm:w-44">
              <Input
                type="number"
                min={1}
                max={5}
                step={0.5}
                value={playback.longPressPlaybackRate}
                onChange={e => {
                  const val = Number.parseFloat(e.target.value)
                  if (Number.isNaN(val)) return
                  setPlaybackSettings({
                    longPressPlaybackRate: Math.max(1, Math.min(5, val)),
                  })
                }}
              />
            </div>
          }
        />
        <SettingsItem
          title="全屏隐藏收起态进度条"
          description="开启后在网页全屏/系统全屏时隐藏操作栏收起后的底部迷你进度条。"
          controlClassName="self-end mt-1"
          control={
            <Switch
              checked={playback.isFullscreenProgressHidden}
              onCheckedChange={checked => setPlaybackSettings({ isFullscreenProgressHidden: checked })}
            />
          }
        />
        <SettingsItem
          title="截图"
          description="在播放器中显示截图按钮。"
          controlClassName="self-end mt-1"
          control={
            <Switch
              checked={playback.isScreenshotEnabled}
              onCheckedChange={checked => setPlaybackSettings({ isScreenshotEnabled: checked })}
            />
          }
        />
      </SettingsSection>

      <SettingsSection
        title="弹幕设置"
        description={
          isAdmin
            ? '配置播放器内置弹幕引擎及弹弹play开放平台凭据。'
            : '自定义播放器弹幕显示、透明度、字号及滚动速度。'
        }
        icon={<MessageSquare className="size-4" />}
        tone="violet"
      >
        <SettingsItem
          title="默认开启弹幕"
          description="进入播放器后自动检索并加载分集弹幕。"
          controlClassName="self-end mt-1"
          control={
            <Switch
              checked={playback.isDanmakuEnabled}
              onCheckedChange={checked => setPlaybackSettings({ isDanmakuEnabled: checked })}
            />
          }
        />
        <SettingsItem
          title="弹幕透明度"
          description="弹幕整体不透明度（0.1~1.0），默认 0.8。"
          control={
            <div className="relative w-full sm:w-44">
              <Input
                type="number"
                min={0.1}
                max={1}
                step={0.1}
                value={playback.danmakuOpacity}
                onChange={e => {
                  const val = Number.parseFloat(e.target.value)
                  if (!Number.isNaN(val)) {
                    setPlaybackSettings({
                      danmakuOpacity: Math.max(0.1, Math.min(1, val)),
                    })
                  }
                }}
              />
            </div>
          }
        />
        <SettingsItem
          title="弹幕字体大小"
          description="弹幕文字字号（像素，范围 12~40），默认 22。"
          control={
            <div className="relative w-full sm:w-44">
              <Input
                type="number"
                min={12}
                max={40}
                step={1}
                value={playback.danmakuFontSize}
                onChange={e => {
                  const val = Number.parseInt(e.target.value, 10)
                  if (!Number.isNaN(val)) {
                    setPlaybackSettings({
                      danmakuFontSize: Math.max(12, Math.min(40, val)),
                    })
                  }
                }}
              />
            </div>
          }
        />
        <SettingsItem
          title="弹幕滚动速度"
          description="弹幕滑过屏幕的时长（秒，范围 1~10，数值越大越慢），默认 5 秒。"
          control={
            <div className="relative w-full sm:w-44">
              <Input
                type="number"
                min={1}
                max={10}
                step={1}
                value={playback.danmakuSpeed}
                onChange={e => {
                  const val = Number.parseInt(e.target.value, 10)
                  if (!Number.isNaN(val)) {
                    setPlaybackSettings({
                      danmakuSpeed: Math.max(1, Math.min(10, val)),
                    })
                  }
                }}
              />
            </div>
          }
        />
        <SettingsItem
          title="弹幕防重叠"
          description="自动计算轨道高度，避免多条弹幕同一时间在同一轨道互相遮挡。"
          controlClassName="self-end mt-1"
          control={
            <Switch
              checked={playback.isDanmakuAntiOverlap}
              onCheckedChange={checked => setPlaybackSettings({ isDanmakuAntiOverlap: checked })}
            />
          }
        />
        {isAdmin && (
          <>
            <SettingsItem
              title="弹幕 API 地址"
              description={
                envApiBase
                  ? `已通过环境变量注入默认地址 (${envApiBase})。若需覆盖可在下方输入，否则保持留空即可。`
                  : '默认为弹弹play官方接口 (https://api.dandanplay.net)。若部署了 danmu_api 等自建服务 (如 Cloudflare Workers/Vercel/Docker)，可填写自建 API 地址，自建服务无需填写 AppId 与 AppSecret。'
              }
              control={
                <div className="w-full sm:w-80">
                  <Input
                    placeholder={envApiBase ? `已继承环境变量: ${envApiBase}` : 'https://api.dandanplay.net'}
                    value={playback.dandanApiBaseUrl}
                    onChange={e => setPlaybackSettings({ dandanApiBaseUrl: e.target.value.trim() })}
                  />
                </div>
              }
            />
            <SettingsItem
              title="弹弹play AppId（官方接口）"
              description={
                envAppId
                  ? `已通过环境变量 OKI_DANDAN_APP_ID 注入 (${envAppId.slice(0, 4)}***)。全站已免配生效。`
                  : '弹弹play开放平台申请的应用 ID。使用官方接口时必填；使用自建 danmu_api 时可留空。'
              }
              control={
                <div className="w-full sm:w-80">
                  <Input
                    placeholder={envAppId ? `已由环境变量配置: ${envAppId.slice(0, 4)}***` : '留空使用免鉴权自建源或本地导入'}
                    value={playback.dandanAppId}
                    onChange={e => setPlaybackSettings({ dandanAppId: e.target.value.trim() })}
                  />
                </div>
              }
            />
            <SettingsItem
              title="弹弹play AppSecret（官方接口）"
              description={
                envAppSecret
                  ? '已通过环境变量 OKI_DANDAN_APP_SECRET 注入密钥。全站已免配生效。'
                  : '弹弹play开放平台生成的应用密钥，前端自动完成 SHA256 签名校验。使用自建 danmu_api 时可留空。'
              }
              control={
                <div className="w-full sm:w-80">
                  <Input
                    type="password"
                    placeholder={envAppSecret ? '已由环境变量配置' : '输入 AppSecret'}
                    value={playback.dandanAppSecret}
                    onChange={e => setPlaybackSettings({ dandanAppSecret: e.target.value.trim() })}
                  />
                </div>
              }
            />
          </>
        )}
      </SettingsSection>

      {tmdbEnabled && isAdmin && (
        <SettingsSection
          title="TMDB 匹配缓存"
          description="缓存详情页和播放器的匹配结果，减少重复检索。"
          icon={<Database className="size-4" />}
          tone="sky"
        >
          <SettingsItem
            title="缓存过期时长（小时）"
            description="缓存超过该时长后自动失效并重新请求，范围 1~168 小时。"
            control={
              <div className="w-full sm:w-48">
                <Input
                  type="number"
                  min={1}
                  max={168}
                  step={1}
                  value={playback.tmdbMatchCacheTTLHours}
                  onChange={e => {
                    const inputVal = Number.parseInt(e.target.value, 10)
                    if (Number.isNaN(inputVal)) return
                    setPlaybackSettings({
                      tmdbMatchCacheTTLHours: Math.max(1, Math.min(168, inputVal)),
                    })
                  }}
                />
              </div>
            }
          />
          <SettingsItem
            title="清空匹配缓存"
            description="立即清除 TMDB 匹配缓存。当前仅清理匹配缓存，后续会纳入更多业务缓存。"
            control={
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3"
                onClick={() => setConfirmClearCacheOpen(true)}
              >
                <Trash2 className="size-4" />
                清空缓存
              </Button>
            }
          />
        </SettingsSection>
      )}

      {tmdbEnabled && isAdmin && (
        <ConfirmModal
          isOpen={confirmClearCacheOpen}
          onClose={() => setConfirmClearCacheOpen(false)}
          onConfirm={() => {
            clearBusinessCaches()
            toast.success('已清空 TMDB 匹配缓存')
          }}
          title="确认清空 TMDB 匹配缓存？"
          description="此操作会删除所有已缓存的 TMDB 匹配结果。下次进入详情页或播放器时将重新请求匹配数据。"
          confirmText="确认清空"
          isDestructive
        />
      )}

      <SettingsSection
        title="剧集展示"
        description="定义详情页剧集列表排序与信息呈现方式。"
        icon={<ListFilter className="size-4" />}
        tone="amber"
      >
        <SettingsItem
          title="剧集默认显示顺序"
          description="影响详情页剧集列表的默认排列顺序。"
          control={
            <div className="w-full sm:w-[220px]">
              <Select
                value={playback.defaultEpisodeOrder}
                onValueChange={(value: 'asc' | 'desc') =>
                  setPlaybackSettings({ defaultEpisodeOrder: value })
                }
              >
                <SelectTrigger id="order" className="w-full">
                  <SelectValue placeholder="选择顺序" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">
                    <div className="flex items-center gap-2">
                      <Gauge className="size-4" />
                      正序（1, 2, 3...）
                    </div>
                  </SelectItem>
                  <SelectItem value="desc">
                    <div className="flex items-center gap-2">
                      <Timer className="size-4" />
                      倒序（..., 3, 2, 1）
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />
      </SettingsSection>
    </SettingsPageShell>
  )
}
