import { useDb, schema } from '~~/server/db'
import { requireAdmin } from '~~/server/utils/auth'
import { eq } from 'drizzle-orm'

/**
 * Remove a bot's wiring.
 *
 * Its messages stay: a channel that suddenly loses half its history is worse
 * than one that shows a name nobody can reach any more. Sessions and keys go,
 * because they are useless without the bot.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const bid = getRouterParam(event, 'id')!
  const db = useDb()
  const [bot] = await db.select().from(schema.bots).where(eq(schema.bots.id, bid)).limit(1)
  if (!bot) throw createError({ statusCode: 404, statusMessage: 'Unknown bot' })
  await db.delete(schema.bots).where(eq(schema.bots.id, bid))
  return { ok: true }
})
