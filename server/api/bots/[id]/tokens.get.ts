import { useDb, schema } from '~~/server/db'
import { requireAdmin } from '~~/server/utils/auth'
import { eq } from 'drizzle-orm'

/** Which keys exist and when they were last used — never the plaintext. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const bid = getRouterParam(event, 'id')!
  const rows = await useDb().select().from(schema.botTokens)
    .where(eq(schema.botTokens.botId, bid))
  return rows.map(r => ({
    id: r.id, prefix: r.prefix, label: r.label,
    lastUsedAt: r.lastUsedAt, createdAt: r.createdAt,
  }))
})
