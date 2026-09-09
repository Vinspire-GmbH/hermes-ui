import { useDb, schema } from '~~/server/db'
import { eq } from 'drizzle-orm'

/** Who is signed in, or null. Null is an answer, not an error. */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const uid = (session as any)?.user?.id
  if (!uid) return null
  const db = useDb()
  const [user] = await db.select({
    id: schema.users.id, name: schema.users.name, email: schema.users.email,
    role: schema.users.role, locale: schema.users.locale,
  }).from(schema.users).where(eq(schema.users.id, uid)).limit(1)
  return user ?? null
})
