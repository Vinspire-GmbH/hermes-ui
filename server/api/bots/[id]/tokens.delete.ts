import { useDb, schema } from '~~/server/db'
import { requireAdmin } from '~~/server/utils/auth'
import { and, eq } from 'drizzle-orm'

/** Revoke one write key. Whatever used it stops working immediately. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const bid = getRouterParam(event, 'id')!
  const { tokenId } = await readBody<{ tokenId?: string }>(event)
  if (!tokenId) throw createError({ statusCode: 400, statusMessage: 'tokenId required' })
  await useDb().delete(schema.botTokens).where(and(
    eq(schema.botTokens.id, tokenId),
    eq(schema.botTokens.botId, bid),
  ))
  return { ok: true }
})
