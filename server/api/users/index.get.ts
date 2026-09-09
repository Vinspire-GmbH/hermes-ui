import { useDb, schema } from '~~/server/db'
import { angemeldet } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await angemeldet(event)
  const db = useDb()
  // Ohne Passwort-Hash — der hat in keiner Antwort etwas zu suchen.
  return db.select({
    id: schema.users.id, name: schema.users.name,
    email: schema.users.email, role: schema.users.role,
  }).from(schema.users)
})
