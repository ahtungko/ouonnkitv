import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import AccountAdmin from '@/features/settings/components/AccountAdmin'
import AnnouncementAdmin from '@/features/announcements/AnnouncementAdmin'
import { Button } from '@/shared/components/ui/button'
import { UnderlineTabs } from '@/shared/components/common/UnderlineTabs'

const modules = [
  { key: 'announcements', name: '站内公告', color: 'bg-amber-500' },
  { key: 'users', name: '用户管理', color: 'bg-violet-500' },
  { key: 'audit', name: '操作记录', color: 'bg-sky-500' },
] as const
type AdminTab = (typeof modules)[number]['key']

export default function AdminView() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // Keep existing account-detail and audit links working.
  const activeTab: AdminTab = params.get('id')
    ? 'users'
    : params.get('view') === 'audit' || params.get('tab') === 'audit'
      ? 'audit'
      : params.get('tab') === 'announcements'
        ? 'announcements'
        : params.get('tab') === 'users' ||
            (!params.has('tab') &&
              ['search', 'enabled', 'nsfw', 'page', 'listPage'].some(key => params.has(key)))
          ? 'users'
          : 'announcements'
  const [announcementOpened, setAnnouncementOpened] = useState(activeTab === 'announcements')

  useEffect(() => {
    if (activeTab === 'announcements') setAnnouncementOpened(true)
  }, [activeTab])

  function selectTab(nextTab: AdminTab) {
    if (nextTab === activeTab) return
    setParams(previous => {
      const next = new URLSearchParams(previous)
      // Account filters survive tab changes; pagination and detail state do not.
      for (const key of ['tab', 'view', 'id', 'listPage', 'page']) next.delete(key)
      if (nextTab === 'announcements' || nextTab === 'users') next.set('tab', nextTab)
      if (nextTab === 'audit') next.set('view', 'audit')
      return next
    })
  }

  return (
    <div className="min-h-[90vh] pb-8">
      <header className="border-border bg-sidebar/80 sticky top-0 z-20 border-b backdrop-blur-md">
        <div className="py-1.5 md:py-3">
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 px-2 text-xs md:h-9 md:px-3 md:text-sm"
              onClick={() => navigate('/')}
            >
              <ArrowLeft />
              返回
            </Button>
            <div className="min-w-0 flex-1 text-right md:flex-none md:text-left">
              <h1 className="truncate text-base font-bold md:text-xl">管理员中心</h1>
              <p className="text-muted-foreground hidden text-xs md:block">
                管理账号、站内公告与操作记录
              </p>
            </div>
            <nav
              aria-label="管理员功能"
              className="order-3 w-full md:order-none md:ml-auto md:flex md:w-[min(58vw,760px)] md:justify-end md:pr-3"
            >
              <UnderlineTabs
                options={modules.map(module => ({
                  key: module.key,
                  label: (
                    <>
                      <span className={`inline-block size-1.5 rounded-full ${module.color}`} />
                      <span>{module.name}</span>
                    </>
                  ),
                  indicatorClassName: module.color,
                }))}
                activeKey={activeTab}
                onChange={selectTab}
                layoutId="admin-tab-underline"
                listClassName="border-b border-transparent"
                leftEdgeClassName="from-sidebar via-sidebar/72 to-transparent"
                rightEdgeClassName="from-sidebar via-sidebar/72 to-transparent"
              />
            </nav>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-0 pt-2 md:px-4 md:pt-4">
        {activeTab !== 'announcements' && (
          <section aria-label={activeTab === 'audit' ? '操作记录' : '用户管理'}>
            <AccountAdmin showNavigation={false} />
          </section>
        )}
        {(announcementOpened || activeTab === 'announcements') && (
          <section aria-label="站内公告" hidden={activeTab !== 'announcements'}>
            <AnnouncementAdmin />
          </section>
        )}
      </main>
    </div>
  )
}
