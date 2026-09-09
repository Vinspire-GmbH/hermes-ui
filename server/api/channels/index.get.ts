import { useDb, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'
import { and, eq } from 'drizzle-orm'

/** The channels this person is in. A DM is one of them. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb()
  const mine = await db.select().from(schema.members).where(and(
    eq(schema.members.kind, 'user'),
    eq(schema.members.refId, user.id),
  ))
  const ids = new Set(mine.map(m => m.channelId))
  const all = await db.select().from(schema.channels)
  return all.filter(c => ids.has(c.id))
})
