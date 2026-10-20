// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const admin = '00000000-0000-4000-8000-000000000001'
const user = '00000000-0000-4000-8000-000000000002'
const migration = readFileSync(
  new URL('../supabase/migrations/202610200001_site_announcement.sql', import.meta.url),
  'utf8',
)
let db: PGlite

async function asUser(id: string, active = true) {
  await db.exec('reset role; set role authenticated')
  await db.query(
    "select set_config('request.jwt.claim.sub', $1, false), set_config('test.active', $2, false)",
    [id, String(active)],
  )
}
async function read() {
  return (
    await db.query<{ value: Record<string, unknown> | null }>(
      'select public.get_site_announcement() as value',
    )
  ).rows[0].value
}
async function save(title: string | null, content: string, published: boolean, revision: number) {
  return (
    await db.query<{ value: Record<string, unknown> }>(
      'select public.save_site_announcement($1, $2, $3, $4) as value',
      [title, content, published, revision],
    )
  ).rows[0].value
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to authenticated;
    create function public.account_is_active() returns boolean language sql stable as $$
      select coalesce(current_setting('test.active', true), 'false') = 'true';
    $$;
    create table public.user_accounts(id uuid primary key, role text);
    insert into public.user_accounts values ('${admin}', 'admin'), ('${user}', 'user');
    alter table public.user_accounts enable row level security;
    grant select on public.user_accounts to authenticated;
    create policy own_account on public.user_accounts for select to authenticated
      using (id = auth.uid() and public.account_is_active());
  `)
  await db.exec(migration)
}, 45000)
beforeEach(async () => {
  await db.exec(`reset role; update public.site_announcement set
    title = '', content = '', published = false, revision = 0`)
  await asUser(admin)
})
afterAll(async () => {
  await db?.close()
})

describe('站内公告数据库权限与发布', () => {
  it('草稿只有管理员能读取，发布后用户可读，下架后不可读', async () => {
    expect(await read()).toMatchObject({ revision: 0, published: false })
    await save('维护通知', '第一行\n第二行', false, 0)
    await asUser(user)
    expect(await read()).toBeNull()
    expect((await db.query('select * from public.site_announcement')).rows).toHaveLength(0)
    await asUser(admin)
    expect(await save(' 维护通知 ', ' 第一行\n第二行 ', true, 1)).toMatchObject({
      title: '维护通知',
      content: '第一行\n第二行',
      revision: 2,
    })
    await asUser(user)
    expect(await read()).toMatchObject({ title: '维护通知', published: true, revision: 2 })
    await asUser(admin)
    await save('维护通知', '第一行\n第二行', false, 2)
    await asUser(user)
    expect(await read()).toBeNull()
  })

  it('用户不能发布，也不能通过直接写表绕过管理员校验', async () => {
    await asUser(user)
    await expect(save('伪造公告', '内容', true, 0)).rejects.toThrow('Admin required')
    await expect(db.exec('update public.site_announcement set published = true')).rejects.toThrow(
      /permission denied/,
    )
    await asUser(admin)
    await expect(db.exec('delete from public.site_announcement')).rejects.toThrow(
      /permission denied/,
    )
  })

  it('禁用或旧会话与匿名用户不能读取或修改公告', async () => {
    await save('通知', '内容', true, 0)
    await asUser(admin, false)
    await expect(read()).rejects.toThrow('Inactive account')
    await expect(save('通知', '内容', true, 1)).rejects.toThrow('Admin required')
    expect((await db.query('select * from public.site_announcement')).rows).toHaveLength(0)
    await db.exec('reset role; set role anon')
    await expect(read()).rejects.toThrow(/permission denied/)
    await expect(save('通知', '内容', true, 1)).rejects.toThrow(/permission denied/)
  })

  it('过期页面无法覆盖新版本，失败时保留已发布内容', async () => {
    await save('第一版', '内容一', true, 0)
    await expect(save('旧页面', '覆盖', true, 0)).rejects.toThrow('Announcement changed')
    expect(await read()).toMatchObject({ title: '第一版', content: '内容一', revision: 1 })
    expect(await save('第二版', '内容二', true, 1)).toMatchObject({ revision: 2 })
  })

  it('限制标题正文长度，空白内容不能发布，空草稿可以保存', async () => {
    await expect(save(null, '正文', true, 0)).rejects.toThrow('Invalid announcement')
    await expect(save(' ', '正文', true, 0)).rejects.toThrow('Invalid announcement')
    await expect(save('标题', ' ', true, 0)).rejects.toThrow('Invalid announcement')
    await expect(save('x'.repeat(101), '正文', false, 0)).rejects.toThrow('Invalid announcement')
    await expect(save('标题', 'x'.repeat(10001), false, 0)).rejects.toThrow('Invalid announcement')
    expect(await save('', '', false, 0)).toMatchObject({ published: false, revision: 1 })
  })

  it('重新执行迁移保留原公告和版本', async () => {
    await save('已有公告', '正文', true, 0)
    await db.exec('reset role')
    await db.exec(migration)
    await asUser(admin)
    expect(await read()).toMatchObject({ title: '已有公告', revision: 1, published: true })
  })
})
