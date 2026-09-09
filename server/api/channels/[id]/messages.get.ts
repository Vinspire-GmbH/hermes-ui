import { useDb, schema } from '~~/server/db'
import { angemeldet } from '~~/server/utils/auth'
import { laufAbfragen } from '~~/server/utils/hermes'
import { eq, and, asc, gt } from 'drizzle-orm'

/**
 * Nachrichten eines Kanals — und der Ort, an dem offene Läufe eingeholt werden.
 *
 * Die Oberfläche fragt ohnehin alle zwei Sekunden nach. Den Stand der Läufe
 * hier mitzuprüfen erspart eine Hintergrundschleife und übersteht jeden
 * Neustart: was zu tun ist, steht in der Datenbank, nicht im Speicher.
 */
export default defineEventHandler(async (event) => {
  const u = await angemeldet(event)
  const cid = getRouterParam(event, 'id')!
  const { seit, faden } = getQuery(event) as { seit?: string; faden?: string }
  const db = useDb()

  const [mitglied] = await db.select().from(schema.members).where(and(
    eq(schema.members.channelId, cid),
    eq(schema.members.kind, 'user'),
    eq(schema.members.refId, u.id),
  )).limit(1)
  if (!mitglied) throw createError({ statusCode: 403, statusMessage: 'Kein Mitglied dieses Kanals' })

  await offeneLaeufeEinholen(cid)

  const filter = [eq(schema.messages.channelId, cid)]
  if (seit) filter.push(gt(schema.messages.createdAt, Number(seit)))
  if (faden) filter.push(eq(schema.messages.threadRootId, faden))

  return db.select().from(schema.messages)
    .where(and(...filter))
    .orderBy(asc(schema.messages.createdAt))
    .limit(500)
})

async function offeneLaeufeEinholen(cid: string) {
  const db = useDb()
  const offen = await db.select().from(schema.messages).where(and(
    eq(schema.messages.channelId, cid),
    eq(schema.messages.state, 'pending'),
  ))

  for (const m of offen) {
    if (!m.runId) continue
    try {
      const stand = await laufAbfragen(m.authorId, m.runId)
      if (!stand.fertig) continue
      const geglueckt = stand.status === 'completed' || stand.status === 'succeeded'
      await db.update(schema.messages).set({
        body: stand.text || (geglueckt ? '(keine Antwort)' : `Lauf beendet mit Status: ${stand.status}`),
        state: geglueckt ? 'done' : 'error',
        runId: null,
      }).where(eq(schema.messages.id, m.id))
    } catch {
      // Ein Aussetzer der Statusabfrage darf die Nachrichtenliste nicht
      // scheitern lassen — beim nächsten Nachfragen in zwei Sekunden erneut.
    }
  }
}
