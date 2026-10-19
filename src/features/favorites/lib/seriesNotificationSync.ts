import { z } from 'zod'
import type { SeriesUpdate } from './seriesTracking'

const episodes = z.array(z.number().int().min(1).max(9999)).max(9999)
const identity = {
  resourceKey: z.string().min(1).max(8192),
  trackingKey: z.string().min(1).max(2048),
  bindingKey: z.string().min(1).max(2048),
  sourceCode: z.string().min(1).max(512),
  vodId: z
    .string()
    .regex(/^[\w-]+$/)
    .max(512),
  resourceSignature: z.string().max(128),
}
export const remoteNotificationSchema = z.object({
  ...identity,
  knownEpisodes: episodes,
  readEpisodes: episodes,
})
export const localNotificationSchema = remoteNotificationSchema.extend({
  baselineEpisodes: episodes,
  syncedKnownEpisodes: episodes,
  syncedReadEpisodes: episodes,
})
export type RemoteSeriesNotification = z.infer<typeof remoteNotificationSchema>
export type LocalSeriesNotification = z.infer<typeof localNotificationSchema>
export type NotificationAccounts = Record<string, Record<string, LocalSeriesNotification>>

export const unionEpisodes = (...arrays: number[][]) =>
  [...new Set(arrays.flat())].sort((a, b) => a - b)
export function notificationIdentity(trackingKey: string, update: SeriesUpdate) {
  if (!update.sourceCode || !update.vodId || !update.checkedAt || !update.episodes?.length)
    return null
  const data = {
    trackingKey,
    bindingKey: update.bindingKey ?? 'auto',
    sourceCode: update.sourceCode,
    vodId: update.vodId,
    resourceSignature: update.resourceSignature ?? '',
  }
  const resourceKey = JSON.stringify([
    data.trackingKey,
    data.bindingKey,
    data.sourceCode,
    data.vodId,
    data.resourceSignature,
  ])
  return { ...data, resourceKey }
}
export function validNotificationIdentity(row: RemoteSeriesNotification): boolean {
  return (
    row.resourceKey ===
      JSON.stringify([
        row.trackingKey,
        row.bindingKey,
        row.sourceCode,
        row.vodId,
        row.resourceSignature,
      ]) && row.readEpisodes.every(number => row.knownEpisodes.includes(number))
  )
}
export function notificationNeedsSync(row: LocalSeriesNotification): boolean {
  return (
    !row.syncedKnownEpisodes.length ||
    row.knownEpisodes.some(number => !row.syncedKnownEpisodes.includes(number)) ||
    row.readEpisodes.some(number => !row.syncedReadEpisodes.includes(number))
  )
}
export function notificationView(row: LocalSeriesNotification) {
  const read = new Set(
    row.syncedKnownEpisodes.length
      ? row.readEpisodes
      : unionEpisodes(row.baselineEpisodes, row.readEpisodes),
  )
  return {
    knownEpisodes: row.knownEpisodes,
    unreadEpisodes: row.knownEpisodes.filter(number => !read.has(number)),
  }
}
export function mergeNotificationAccounts(
  a: NotificationAccounts,
  b: NotificationAccounts,
): NotificationAccounts {
  const result: NotificationAccounts = { ...a }
  for (const [owner, rows] of Object.entries(b)) {
    const merged = { ...result[owner] }
    for (const [key, right] of Object.entries(rows)) {
      const left = merged[key]
      merged[key] = !left
        ? right
        : {
            ...left,
            knownEpisodes: unionEpisodes(left.knownEpisodes, right.knownEpisodes),
            readEpisodes: unionEpisodes(left.readEpisodes, right.readEpisodes),
            // Before the first server baseline, retain the smaller shared baseline.
            baselineEpisodes: left.baselineEpisodes.filter(number =>
              right.baselineEpisodes.includes(number),
            ),
            syncedKnownEpisodes: unionEpisodes(left.syncedKnownEpisodes, right.syncedKnownEpisodes),
            syncedReadEpisodes: unionEpisodes(left.syncedReadEpisodes, right.syncedReadEpisodes),
          }
    }
    result[owner] = merged
  }
  return result
}

const accountsSchema = z.record(
  z.string().min(1).max(128),
  z.record(z.string().min(1).max(8192), localNotificationSchema),
)
export function parseNotificationAccounts(value: unknown): NotificationAccounts {
  const accounts = accountsSchema.parse(value)
  for (const rows of Object.values(accounts))
    for (const [key, row] of Object.entries(rows)) {
      if (key !== row.resourceKey || !validNotificationIdentity(row))
        throw new Error('Invalid reminder sync cache')
    }
  return accounts
}
