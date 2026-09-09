import { useDb, schema } from '~~/server/db'
import { requireAdmin } from '~~/server/utils/auth'
import { isNull } from 'drizzle-orm'

/** Open invitations. The link itself is gone — only an admin can issue a new one. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const rows = await useDb().select().from(schema.invites)
    .where(isNull(schema.invites.acceptedAt))
  return rows
    .filter(r => r.expiresAt > Date.now())
    .map(r => ({
      id: r.id, email: r.email, role: r.role,
      expiresAt: r.expiresAt, createdAt: r.createdAt,
    }))
})
