import { useDb, schema } from '~~/server/db'
import { requireAdmin } from '~~/server/utils/auth'
import { eq } from 'drizzle-orm'

/** Withdraw an invitation. The link stops working at once. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { inviteId } = await readBody<{ inviteId?: string }>(event)
  if (!inviteId) throw createError({ statusCode: 400, statusMessage: 'inviteId required' })
  await useDb().delete(schema.invites).where(eq(schema.invites.id, inviteId))
  return { ok: true }
})
