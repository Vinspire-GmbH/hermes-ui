import { useDb, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'

/** The bots this console knows. Credentials stay server-side. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb()
  const rows = await db.select({
    id: schema.bots.id, slug: schema.bots.slug, name: schema.bots.name,
    profile: schema.bots.profile, color: schema.bots.color,
    description: schema.bots.description, active: schema.bots.active,
    operator: schema.bots.operator, model: schema.bots.model,
  }).from(schema.bots)

  // An administrator also gets the address, because they have to check it.
  // The key never leaves the server for anyone.
  if (user.role !== 'admin') return rows
  const full = await db.select().from(schema.bots)
  return rows.map(r => ({ ...r, apiBase: full.find(f => f.id === r.id)?.apiBase }))
})
