import { useDb, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'

/** Colleagues, for name badges and for inviting into a channel. */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  return useDb().select({
    id: schema.users.id, name: schema.users.name, email: schema.users.email,
    role: schema.users.role, createdAt: schema.users.createdAt,
  }).from(schema.users)
})
