import { useDb, schema } from '~~/server/db'
import { angemeldet } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await angemeldet(event)
  const db = useDb()
  // apiKey und apiBase bleiben serverseitig.
  return db.select({
    id: schema.bots.id, slug: schema.bots.slug, name: schema.bots.name,
    profile: schema.bots.profile, color: schema.bots.color,
    description: schema.bots.description, active: schema.bots.active,
  }).from(schema.bots)
})
