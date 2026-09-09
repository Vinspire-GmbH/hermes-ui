import { useDb, schema } from '~~/server/db'
import { istAdmin } from '~~/server/utils/auth'
import { eq } from 'drizzle-orm'

/** Welche Schlüssel es gibt und wann sie zuletzt benutzt wurden — ohne Klartext. */
export default defineEventHandler(async (event) => {
  await istAdmin(event)
  const bid = getRouterParam(event, 'id')!
  const db = useDb()
  const zeilen = await db.select().from(schema.botTokens)
    .where(eq(schema.botTokens.botId, bid))
  return zeilen.map(z => ({
    id: z.id, prefix: z.prefix, label: z.label,
    lastUsedAt: z.lastUsedAt, createdAt: z.createdAt,
  }))
})
