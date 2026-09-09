import { useDb, schema } from '../db'
import { eq } from 'drizzle-orm'

/** The signed-in person, or a 401. Every endpoint goes through here. */
export async function requireUser(event: any) {
  const session = await getUserSession(event)
  const uid = (session as any)?.user?.id
  if (!uid) throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  const db = useDb()
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, uid)).limit(1)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Account removed' })
  return user
}

/** For anything that affects other people: inviting, wiring up bots. */
export async function requireAdmin(event: any) {
  const user = await requireUser(event)
  if (user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Administrators only' })
  }
  return user
}
