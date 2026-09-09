import { useDb, schema } from '~~/server/db'
import { id, slugify } from '~~/server/utils/ids'
import { sql } from 'drizzle-orm'

/**
 * First run: creates the first administrator — and only while there is no
 * user at all. After that the endpoint answers 409.
 *
 * This way the installation needs no initial password in an environment
 * variable, the kind nobody changes afterwards.
 */
export default defineEventHandler(async (event) => {
  const db = useDb()
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.users)
  if (n > 0) throw createError({ statusCode: 409, statusMessage: 'Already set up' })

  const { name, email, password } = await readBody<{
    name?: string; email?: string; password?: string
  }>(event)
  if (!name || !email || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Name, email and password required' })
  }
  if (password.length < 10) {
    throw createError({ statusCode: 400, statusMessage: 'Password needs at least 10 characters' })
  }

  const uid = id('u')
  const now = Date.now()
  await db.insert(schema.users).values({
    id: uid, email: email.toLowerCase().trim(), name,
    passwordHash: await hashPassword(password), role: 'admin', createdAt: now,
  })

  // One channel to start with, so the interface does not open empty.
  const cid = id('c')
  await db.insert(schema.channels).values({
    id: cid, slug: slugify('general'), name: 'general',
    topic: 'Anything without a channel of its own', kind: 'channel',
    createdBy: uid, createdAt: now,
  })
  await db.insert(schema.members).values({
    id: id('m'), channelId: cid, kind: 'user', refId: uid, addedAt: now,
  })

  await setUserSession(event, { user: { id: uid, name, email, role: 'admin' } })
  return { ok: true, user: { id: uid, name, email, role: 'admin' } }
})
