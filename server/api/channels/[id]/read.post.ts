import { useDb, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'
import { and, eq } from 'drizzle-orm'

/**
 * Mark this channel read up to now.
 *
 * Called by the interface when the channel is actually on screen — not on
 * every poll. A window sitting behind others keeps polling, and marking those
 * fetches as "read" would defeat the whole point of the unread mark.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const cid = getRouterParam(event, 'id')!
  const { at } = await readBody<{ at?: number }>(event).catch(() => ({ at: undefined }))

  const db = useDb()
  const [member] = await db.select().from(schema.members).where(and(
    eq(schema.members.channelId, cid),
    eq(schema.members.kind, 'user'),
    eq(schema.members.refId, user.id),
  )).limit(1)
  if (!member) throw createError({ statusCode: 403, statusMessage: 'Not a member of this channel' })

  // Never move the mark backwards: two tabs on the same channel would
  // otherwise resurrect messages the person has already seen.
  const next = Math.min(Number(at) || Date.now(), Date.now())
  if ((member.lastReadAt || 0) >= next) return { ok: true, unchanged: true }

  await db.update(schema.members).set({ lastReadAt: next })
    .where(eq(schema.members.id, member.id))
  return { ok: true, lastReadAt: next }
})
