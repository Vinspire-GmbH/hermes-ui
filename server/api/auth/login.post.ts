import { useDb, schema } from '~~/server/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody<{ email?: string; password?: string }>(event)
  if (!email || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Email and password required' })
  }
  const db = useDb()
  const [user] = await db.select().from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase().trim())).limit(1)

  // Deliberately the same message for "no account" and "wrong password":
  // otherwise signing in reveals which addresses exist.
  const wrong = () => createError({ statusCode: 401, statusMessage: 'Sign-in failed' })
  if (!user) throw wrong()
  if (!(await verifyPassword(user.passwordHash, password))) throw wrong()

  await setUserSession(event, {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  })
  return {
    id: user.id, name: user.name, email: user.email,
    role: user.role, locale: user.locale,
  }
})
