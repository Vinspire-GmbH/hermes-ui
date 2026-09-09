import { useDb, schema } from '~~/server/db'
import { istAdmin } from '~~/server/utils/auth'
import { id } from '~~/server/utils/ids'
import { schluesselErzeugen } from '~~/server/utils/bottoken'
import { eq } from 'drizzle-orm'

/**
 * Einen Schreibschlüssel für einen Bot anlegen.
 *
 * Der Klartext steht **nur in dieser einen Antwort**. Danach existiert er
 * ausschließlich dort, wo er hingehört: in der Konfiguration des Bots auf dem
 * Hermes-Server.
 */
export default defineEventHandler(async (event) => {
  await istAdmin(event)
  const bid = getRouterParam(event, 'id')!
  const { label } = await readBody<{ label?: string }>(event).catch(() => ({ label: undefined }))

  const db = useDb()
  const [bot] = await db.select().from(schema.bots).where(eq(schema.bots.id, bid)).limit(1)
  if (!bot) throw createError({ statusCode: 404, statusMessage: 'Bot unbekannt' })

  const { token, hash, prefix } = schluesselErzeugen()
  await db.insert(schema.botTokens).values({
    id: id('tok'), botId: bid, tokenHash: hash, prefix,
    label: label || null, createdAt: Date.now(),
  })
  return { bot: bot.slug, token, prefix, hinweis: 'Dieser Schlüssel wird nicht wieder angezeigt.' }
})
