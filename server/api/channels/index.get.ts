import { useDb, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'
import { and, eq, gt, ne, sql } from 'drizzle-orm'

/**
 * The channels this person is in, each with how much is new.
 *
 * "New" means: written after they last looked, and not by them. Their own
 * messages counting as unread is the kind of detail that makes a badge
 * useless.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb()

  const mine = await db.select().from(schema.members).where(and(
    eq(schema.members.kind, 'user'),
    eq(schema.members.refId, user.id),
  ))
  if (!mine.length) return []

  const byChannel = new Map(mine.map(m => [m.channelId, m]))
  const all = await db.select().from(schema.channels)

  const rows = await Promise.all(all
    .filter(c => byChannel.has(c.id))
    .map(async (c) => {
      const since = byChannel.get(c.id)!.lastReadAt || 0
      const [{ n }] = await db.select({ n: sql<number>`count(*)` })
        .from(schema.messages)
        .where(and(
          eq(schema.messages.channelId, c.id),
          gt(schema.messages.createdAt, since),
          ne(schema.messages.authorId, user.id),
        ))
      return { ...c, unread: Number(n) || 0, lastReadAt: since || null }
    }))
  return rows
})
