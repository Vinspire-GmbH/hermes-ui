import { useDb, schema } from '~~/server/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { email, passwort } = await readBody<{ email?: string; passwort?: string }>(event)
  if (!email || !passwort) {
    throw createError({ statusCode: 400, statusMessage: 'E-Mail und Passwort nötig' })
  }
  const db = useDb()
  const [u] = await db.select().from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase().trim())).limit(1)

  // Bewusst dieselbe Meldung für „kein Konto" und „falsches Passwort": sonst
  // verrät die Anmeldung, welche Adressen existieren.
  const falsch = () => createError({ statusCode: 401, statusMessage: 'Anmeldung fehlgeschlagen' })
  if (!u) throw falsch()
  if (!(await verifyPassword(u.passwordHash, passwort))) throw falsch()

  await setUserSession(event, {
    user: { id: u.id, name: u.name, email: u.email, role: u.role },
  })
  return { id: u.id, name: u.name, email: u.email, role: u.role }
})
