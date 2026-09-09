import { useDb, schema } from '~~/server/db'
import { istAdmin } from '~~/server/utils/auth'
import { id } from '~~/server/utils/ids'

/** Mitarbeiter anlegen. Nur Administratoren. */
export default defineEventHandler(async (event) => {
  await istAdmin(event)
  const { name, email, passwort, role } = await readBody<any>(event)
  if (!name || !email || !passwort) {
    throw createError({ statusCode: 400, statusMessage: 'Name, E-Mail und Passwort nötig' })
  }
  if (String(passwort).length < 10) {
    throw createError({ statusCode: 400, statusMessage: 'Passwort mit mindestens 10 Zeichen' })
  }
  const db = useDb()
  const uid = id('u')
  try {
    await db.insert(schema.users).values({
      id: uid, email: String(email).toLowerCase().trim(), name,
      passwordHash: await hashPassword(String(passwort)),
      role: role === 'admin' ? 'admin' : 'member', createdAt: Date.now(),
    })
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'E-Mail schon vergeben' })
  }
  return { id: uid, name, email, role: role === 'admin' ? 'admin' : 'member' }
})
