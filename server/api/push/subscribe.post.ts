import { useDb, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'
import { id } from '~~/server/utils/ids'
import { eq } from 'drizzle-orm'

/**
 * Store one browser's push endpoint.
 *
 * The endpoint is unique, so re-subscribing the same browser updates the row
 * instead of piling up duplicates — browsers do re-subscribe, for instance
 * after the push service rotates its keys.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>(event)
  const endpoint = body?.endpoint
  const p256dh = body?.keys?.p256dh
  const auth = body?.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    throw createError({ statusCode: 400, statusMessage: 'Incomplete subscription' })
  }

  const db = useDb()
  const [existing] = await db.select().from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.endpoint, endpoint)).limit(1)

  const values = {
    userId: user.id, endpoint, p256dh, auth,
    userAgent: getHeader(event, 'user-agent') || null,
  }
  if (existing) {
    await db.update(schema.pushSubscriptions).set(values)
      .where(eq(schema.pushSubscriptions.id, existing.id))
  } else {
    await db.insert(schema.pushSubscriptions)
      .values({ id: id('ps'), ...values, createdAt: Date.now() })
  }
  return { ok: true }
})
