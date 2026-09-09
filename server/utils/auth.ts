import { useDb, schema } from '../db'
import { eq } from 'drizzle-orm'

/** Der angemeldete Mensch, oder ein 401. Jeder Endpunkt geht hierdurch. */
export async function angemeldet(event: any) {
  const sitzung = await getUserSession(event)
  const uid = (sitzung as any)?.user?.id
  if (!uid) throw createError({ statusCode: 401, statusMessage: 'Nicht angemeldet' })
  const db = useDb()
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, uid)).limit(1)
  if (!u) throw createError({ statusCode: 401, statusMessage: 'Benutzer entfernt' })
  return u
}

/** Für alles, was andere betrifft: Benutzer anlegen, Bots verdrahten. */
export async function istAdmin(event: any) {
  const u = await angemeldet(event)
  if (u.role !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Nur für Administratoren' })
  return u
}
