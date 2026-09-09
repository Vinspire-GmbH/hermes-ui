import { useDb, schema } from '~~/server/db'
import { id, slugify } from '~~/server/utils/ids'
import { sql } from 'drizzle-orm'

/**
 * Erste Einrichtung: legt den ersten Administrator an — und nur dann, wenn es
 * noch keinen Benutzer gibt. Danach antwortet der Endpunkt mit 409.
 *
 * So braucht die Installation kein Startpasswort in einer Umgebungsvariablen,
 * das hinterher niemand mehr ändert.
 */
export default defineEventHandler(async (event) => {
  const db = useDb()
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.users)
  if (n > 0) throw createError({ statusCode: 409, statusMessage: 'Bereits eingerichtet' })

  const { name, email, passwort } = await readBody<{ name?: string; email?: string; passwort?: string }>(event)
  if (!name || !email || !passwort) {
    throw createError({ statusCode: 400, statusMessage: 'Name, E-Mail und Passwort nötig' })
  }
  if (passwort.length < 10) {
    throw createError({ statusCode: 400, statusMessage: 'Passwort mit mindestens 10 Zeichen' })
  }

  const uid = id('u')
  const jetzt = Date.now()
  await db.insert(schema.users).values({
    id: uid, email: email.toLowerCase().trim(), name,
    passwordHash: await hashPassword(passwort), role: 'admin', createdAt: jetzt,
  })

  // Ein Kanal zum Anfangen, damit die Oberfläche nicht leer startet.
  const cid = id('c')
  await db.insert(schema.channels).values({
    id: cid, slug: slugify('allgemein'), name: 'allgemein',
    topic: 'Alles, was keinen eigenen Kanal hat', kind: 'channel',
    createdBy: uid, createdAt: jetzt,
  })
  await db.insert(schema.members).values({
    id: id('m'), channelId: cid, kind: 'user', refId: uid, addedAt: jetzt,
  })

  await setUserSession(event, { user: { id: uid, name, email, role: 'admin' } })
  return { ok: true, user: { id: uid, name, email, role: 'admin' } }
})
