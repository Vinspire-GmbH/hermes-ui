import { useDb, schema } from '~~/server/db'
import { requireAdmin } from '~~/server/utils/auth'
import { id } from '~~/server/utils/ids'
import { newToken } from '~~/server/utils/tokens'
import { eq } from 'drizzle-orm'

/**
 * Issue a write key for a bot.
 *
 * The plaintext is in **this one response only**. After that it exists where
 * it belongs: in the bot's configuration on the Hermes side.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const bid = getRouterParam(event, 'id')!
  const { label } = await readBody<{ label?: string }>(event).catch(() => ({ label: undefined }))

  const db = useDb()
  const [bot] = await db.select().from(schema.bots).where(eq(schema.bots.id, bid)).limit(1)
  if (!bot) throw createError({ statusCode: 404, statusMessage: 'Unknown bot' })

  const { token, hash, prefix } = newToken()
  await db.insert(schema.botTokens).values({
    id: id('tok'), botId: bid, tokenHash: hash, prefix,
    label: label || null, createdAt: Date.now(),
  })
  return { bot: bot.slug, token, prefix, note: 'This key is not shown again.' }
})
