import webpush from 'web-push'
import { useDb, schema } from '../db'
import { and, eq, ne } from 'drizzle-orm'

let configured: boolean | null = null

/**
 * Web Push needs a VAPID key pair. Without one the feature stays off rather
 * than throwing on every message — a console without notifications still
 * works, and an installation that never set the keys should not see errors in
 * its log on every reply.
 *
 * Generate a pair with:  npx web-push generate-vapid-keys
 */
function ready() {
  if (configured !== null) return configured
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'
  configured = Boolean(publicKey && privateKey)
  if (configured) webpush.setVapidDetails(subject, publicKey!, privateKey!)
  return configured
}

export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null
}

export interface Notification {
  title: string
  body: string
  url: string
  tag?: string
}

/**
 * Notify the people in a channel — everyone except the author.
 *
 * Deliberately fire-and-forget: a push service that is slow or down must not
 * hold up the reply that triggered the notification. Endpoints the service
 * rejects as gone (404/410) are deleted, because a dead endpoint stays dead
 * and retrying it forever is how a queue fills up.
 */
export async function notifyChannel(
  channelId: string, notification: Notification, exceptUserId?: string,
) {
  if (!ready()) return
  const db = useDb()

  const memberRows = await db.select().from(schema.members).where(and(
    eq(schema.members.channelId, channelId),
    eq(schema.members.kind, 'user'),
  ))
  const userIds = memberRows.map(m => m.refId).filter(uid => uid !== exceptUserId)
  if (!userIds.length) return

  const subs = (await db.select().from(schema.pushSubscriptions))
    .filter(s => userIds.includes(s.userId))
  if (!subs.length) return

  const payload = JSON.stringify(notification)
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      }, payload, { TTL: 60 * 60 * 12 })
    } catch (e: any) {
      const code = e?.statusCode
      if (code === 404 || code === 410) {
        await db.delete(schema.pushSubscriptions)
          .where(eq(schema.pushSubscriptions.id, s.id))
      }
    }
  }))
}

/** Cut a message down to something that fits on a lock screen. */
export function preview(text: string, max = 140) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}
