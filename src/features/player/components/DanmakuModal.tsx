import { useState, useRef } from 'react'
import { useNavigate } from 'react-router'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Switch } from '@/shared/components/ui/switch'
import { Badge } from '@/shared/components/ui/badge'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { Spinner } from '@/shared/components/ui/spinner'
import { toast } from 'sonner'
import {
  AlertCircle,
  MessageSquare,
  Search,
  Upload,
  Sliders,
  FileCode,
  Sparkles,
} from 'lucide-react'
import {
  searchDandanEpisodes,
  fetchDandanComments,
  fetchBilibiliCidComments,
} from '../lib/danmakuService'
import {
  parseBilibiliXml,
  parseDandanComments,
  type DanmakuComment,
  type DanmakuEpisodeMatch,
} from '../lib/danmaku'
import { useSettingStore } from '@/shared/store/settingStore'
import { cn } from '@/shared/lib/utils'

interface DanmakuModalProps {
  isOpen: boolean
  onClose: () => void
  currentCount: number
  matchedTitle?: string
  isDanmakuVisible: boolean
  onToggleVisible: (visible: boolean) => void
  onApplyComments: (comments: DanmakuComment[], matchInfo?: string) => void
  onUpdateConfig: (config: {
    opacity?: number
    fontSize?: number
    speed?: number
    antiOverlap?: boolean
  }) => void
  initialSearchQuery?: string
}

export function DanmakuModal({
  isOpen,
  onClose,
  currentCount,
  matchedTitle,
  isDanmakuVisible,
  onToggleVisible,
  onApplyComments,
  onUpdateConfig,
  initialSearchQuery = '',
}: DanmakuModalProps) {
  const { playback, setPlaybackSettings } = useSettingStore()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'status' | 'match' | 'import'>('status')
  const hasDandanConfig = Boolean(playback.dandanAppId && playback.dandanAppSecret)

  // Search match tab
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery)
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<DanmakuEpisodeMatch[]>([])
  const [selectedEpId, setSelectedEpId] = useState<number | null>(null)
  const [isLoadingComments, setIsLoadingComments] = useState(false)

  // CID / File import tab
  const [bilibiliCid, setBilibiliCid] = useState('')
  const [isFetchingCid, setIsFetchingCid] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSearch = async () => {
    if (!hasDandanConfig) {
      toast.info('请先前往设置配置弹弹play凭据，或使用 CID / 本地文件导入')
      return
    }
    if (!searchQuery.trim()) {
      toast.error('请输入剧集搜索关键词')
      return
    }
    setIsSearching(true)
    try {
      const results = await searchDandanEpisodes(searchQuery, {
        appId: playback.dandanAppId,
        appSecret: playback.dandanAppSecret,
      })
      setSearchResults(results)
      if (results.length === 0) {
        toast.info('未在弹弹play中检索到相关剧集，请尝试更简洁的剧名')
      }
    } catch {
      toast.error('搜索弹幕失败，请检查网络或代理配置')
    } finally {
      setIsSearching(false)
    }
  }

  const handleSelectEpisode = async (ep: DanmakuEpisodeMatch) => {
    setSelectedEpId(ep.episodeId)
    setIsLoadingComments(true)
    try {
      const comments = await fetchDandanComments(ep.episodeId, {
        appId: playback.dandanAppId,
        appSecret: playback.dandanAppSecret,
      })
      if (comments.length === 0) {
        toast.warning('该分集暂无弹幕记录')
      } else {
        toast.success(`成功加载 ${comments.length} 条弹幕`)
      }
      onApplyComments(comments, `${ep.animeTitle} - ${ep.episodeTitle}`)
      onClose()
    } catch {
      toast.error('加载弹幕数据失败')
    } finally {
      setIsLoadingComments(false)
    }
  }

  const handleFetchBilibiliCid = async () => {
    const trimmed = bilibiliCid.trim()
    if (!trimmed) {
      toast.error('请输入 B 站 CID')
      return
    }
    setIsFetchingCid(true)
    try {
      const comments = await fetchBilibiliCidComments(trimmed)
      if (comments.length === 0) {
        toast.warning('未获取到该 CID 的弹幕，请核对数字')
      } else {
        toast.success(`成功获取 ${comments.length} 条 B 站弹幕`)
        onApplyComments(comments, `Bilibili CID: ${trimmed}`)
        onClose()
      }
    } catch {
      toast.error('请求 B 站弹幕失败')
    } finally {
      setIsFetchingCid(false)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const text = ev.target?.result as string
        let comments: DanmakuComment[] = []

        if (file.name.endsWith('.xml') || text.includes('<?xml') || text.includes('<d p=')) {
          comments = parseBilibiliXml(text)
        } else if (file.name.endsWith('.json')) {
          const parsedJson = JSON.parse(text)
          if (Array.isArray(parsedJson.comments)) {
            comments = parseDandanComments(parsedJson.comments)
          } else if (Array.isArray(parsedJson)) {
            comments = parsedJson
          }
        }

        if (comments.length === 0) {
          toast.error('未能从文件中识别出有效弹幕数据')
        } else {
          toast.success(`成功从本地文件导入 ${comments.length} 条弹幕！`)
          onApplyComments(comments, `本地文件: ${file.name}`)
          onClose()
        }
      } catch {
        toast.error('解析本地弹幕文件失败')
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.readAsText(file)
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="size-5 text-primary" />
            弹幕控制与关联
          </DialogTitle>
          <DialogDescription>
            支持全网多源弹幕检索、本地 XML 导入与实时播放控制。
          </DialogDescription>
        </DialogHeader>

        {/* Tab 导航 */}
        <div className="flex border-b border-border/40 pb-2 gap-2 text-sm">
          <Button
            variant={activeTab === 'status' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setActiveTab('status')}
          >
            <Sliders className="size-3.5" />
            状态与调节
          </Button>
          <Button
            variant={activeTab === 'match' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setActiveTab('match')}
          >
            <Search className="size-3.5" />
            手动匹配
          </Button>
          <Button
            variant={activeTab === 'import' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setActiveTab('import')}
          >
            <Upload className="size-3.5" />
            CID / 本地导入
          </Button>
        </div>

        {/* Tab 1: 状态与调节 */}
        {activeTab === 'status' && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/40 p-3 space-y-1.5 border border-border/40">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">当前弹幕池状态</span>
                <Badge variant={currentCount > 0 ? 'default' : 'secondary'} className="text-xs">
                  {currentCount > 0 ? `${currentCount} 条已就绪` : '暂无弹幕'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {matchedTitle ? `已匹配：${matchedTitle}` : '未关联外部弹幕，可通过手动匹配或导入添加'}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">弹幕显示开关</div>
                  <div className="text-xs text-muted-foreground">控制屏幕上的弹幕层渲染</div>
                </div>
                <Switch
                  checked={isDanmakuVisible}
                  onCheckedChange={checked => onToggleVisible(checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">不透明度</div>
                  <div className="text-xs text-muted-foreground">当前：{playback.danmakuOpacity}</div>
                </div>
                <Input
                  type="number"
                  min={0.1}
                  max={1}
                  step={0.1}
                  className="w-24 h-8 text-right"
                  value={playback.danmakuOpacity}
                  onChange={e => {
                    const val = Number.parseFloat(e.target.value)
                    if (!Number.isNaN(val)) {
                      const opacity = Math.max(0.1, Math.min(1, val))
                      setPlaybackSettings({ danmakuOpacity: opacity })
                      onUpdateConfig({ opacity })
                    }
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">字号大小 (px)</div>
                  <div className="text-xs text-muted-foreground">当前：{playback.danmakuFontSize}px</div>
                </div>
                <Input
                  type="number"
                  min={12}
                  max={40}
                  step={1}
                  className="w-24 h-8 text-right"
                  value={playback.danmakuFontSize}
                  onChange={e => {
                    const val = Number.parseInt(e.target.value, 10)
                    if (!Number.isNaN(val)) {
                      const fontSize = Math.max(12, Math.min(40, val))
                      setPlaybackSettings({ danmakuFontSize: fontSize })
                      onUpdateConfig({ fontSize })
                    }
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">防重叠排版</div>
                  <div className="text-xs text-muted-foreground">自动计算可用轨道高度</div>
                </div>
                <Switch
                  checked={playback.isDanmakuAntiOverlap}
                  onCheckedChange={checked => {
                    setPlaybackSettings({ isDanmakuAntiOverlap: checked })
                    onUpdateConfig({ antiOverlap: checked })
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: 手动检索 */}
        {activeTab === 'match' && (
          <div className="space-y-3 py-2">
            {!hasDandanConfig ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                  <AlertCircle className="size-4 shrink-0" />
                  尚未配置弹弹play凭据
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  弹弹play 开放弹幕网络已全面启用应用签名校验。如需全网聚合检索，请先前往播放设置免费配置凭据；或者切换到旁边的「CID / 本地导入」免凭据拉取 B 站弹幕。
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      onClose()
                      navigate('/settings/playback')
                    }}
                  >
                    前往配置凭据
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs"
                    onClick={() => setActiveTab('import')}
                  >
                    使用免配置 CID 导入
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    placeholder="输入剧集名称，如: 双城之战 / 庆余年"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  />
                  <Button size="sm" onClick={handleSearch} disabled={isSearching} className="gap-1 px-4">
                    {isSearching ? <Spinner className="size-4" /> : <Search className="size-4" />}
                    搜索
                  </Button>
                </div>

                <ScrollArea className="h-56 rounded-md border border-border/40 p-2">
                  {isSearching ? (
                    <div className="flex h-full items-center justify-center p-8 text-muted-foreground text-sm gap-2">
                      <Spinner className="size-4" />
                      正在全网检索弹幕剧集...
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="space-y-1.5">
                      {searchResults.map(ep => (
                        <div
                          key={ep.episodeId}
                          onClick={() => handleSelectEpisode(ep)}
                          className={cn(
                            'flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors text-sm',
                            selectedEpId === ep.episodeId
                              ? 'bg-primary/10 text-primary border border-primary/30'
                              : 'hover:bg-muted/60',
                          )}
                        >
                          <div className="space-y-0.5 max-w-[80%]">
                            <div className="font-medium truncate">{ep.animeTitle}</div>
                            <div className="text-xs text-muted-foreground truncate">{ep.episodeTitle}</div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            disabled={isLoadingComments && selectedEpId === ep.episodeId}
                          >
                            {isLoadingComments && selectedEpId === ep.episodeId ? (
                              <Spinner className="size-3.5" />
                            ) : (
                              '匹配此集'
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground text-xs gap-1.5">
                      <Sparkles className="size-6 text-muted-foreground/40" />
                      <span>输入影视剧名称搜索弹弹play分集</span>
                      <span>可匹配来自 B站、爱奇艺、腾讯等综合弹幕</span>
                    </div>
                  )}
                </ScrollArea>
              </>
            )}
          </div>
        )}

        {/* Tab 3: CID 与本地导入 */}
        {activeTab === 'import' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">通过 B 站 CID 直接拉取</label>
              <div className="flex gap-2">
                <Input
                  placeholder="例如: 186803402"
                  value={bilibiliCid}
                  onChange={e => setBilibiliCid(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleFetchBilibiliCid()}
                />
                <Button
                  size="sm"
                  onClick={handleFetchBilibiliCid}
                  disabled={isFetchingCid}
                  className="px-4 shrink-0"
                >
                  {isFetchingCid ? <Spinner className="size-4" /> : '拉取弹幕'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                直接从 comment.bilibili.com 拉取公开弹幕 XML 文件。
              </p>
            </div>

            <div className="border-t border-border/40 pt-3 space-y-2">
              <label className="text-sm font-medium">从本地文件导入</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml,.json"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                variant="outline"
                className="w-full gap-2 border-dashed"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileCode className="size-4 text-primary" />
                选择本地 .xml 或 .json 弹幕文件
              </Button>
              <p className="text-xs text-muted-foreground">
                支持各下载工具或网站导出的标准 B 站 XML 格式弹幕。
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
