import { useDb, schema } from '~~/server/db'
import { angemeldet } from '~~/server/utils/auth'
import { id } from '~~/server/utils/ids'
import { frageBot, neueSitzung } from '~~/server/utils/hermes'
import { eq, and, isNull } from 'drizzle-orm'

/**
 * Nachricht senden — und, falls angesprochen, den Bot antworten lassen.
 *
 * Der Agent braucht bis zu zwei Minuten. Deshalb wird die Antwort **nicht**
 * abgewartet: es entsteht sofort eine Nachricht im Zustand `pending`, der Lauf
 * geschieht im Hintergrund, und die Oberfläche holt das Ergebnis nach. Anders
 * hinge der Absender zwei Minuten in einer offenen Anfrage.
 */
export default defineEventHandler(async (event) => {
  const u = await angemeldet(event)
  const cid = getRouterParam(event, 'id')!
  const { body, faden } = await readBody<{ body?: string; faden?: string | null }>(event)
  if (!body?.trim()) throw createError({ statusCode: 400, statusMessage: 'Leere Nachricht' })

  const db = useDb()
  const mitglieder = await db.select().from(schema.members)
    .where(eq(schema.members.channelId, cid))
  if (!mitglieder.some(m => m.kind === 'user' && m.refId === u.id)) {
    throw createError({ statusCode: 403, statusMessage: 'Kein Mitglied dieses Kanals' })
  }

  const jetzt = Date.now()
  const mid = id('msg')
  await db.insert(schema.messages).values({
    id: mid, channelId: cid, threadRootId: faden || null,
    authorKind: 'user', authorId: u.id, body: body.trim(),
    state: 'done', createdAt: jetzt,
  })

  const [kanal] = await db.select().from(schema.channels)
    .where(eq(schema.channels.id, cid)).limit(1)
  const botsImKanal = mitglieder.filter(m => m.kind === 'bot').map(m => m.refId)

  // Wer ist gemeint? In einer Direktnachricht immer der Bot; in einem Kanal
  // nur, wer mit @kürzel erwähnt wird — sonst würde jeder Zuruf zwischen
  // Kollegen vier Agenten und damit vier Modellaufrufe auslösen.
  let gefragt: string[] = []
  if (kanal?.kind === 'dm') {
    gefragt = botsImKanal
  } else if (botsImKanal.length) {
    const alle = await db.select().from(schema.bots)
    gefragt = alle
      .filter(b => botsImKanal.includes(b.id))
      .filter(b => new RegExp(`@${b.slug}\\b`, 'i').test(body))
      .map(b => b.id)
  }

  for (const botId of gefragt) {
    const antwortId = id('msg')
    await db.insert(schema.messages).values({
      id: antwortId, channelId: cid, threadRootId: faden || null,
      authorKind: 'bot', authorId: botId, body: '', state: 'pending',
      createdAt: Date.now(),
    })
    // Absichtlich nicht abgewartet.
    void laufen(botId, cid, faden || null, body.trim(), antwortId)
  }

  return { id: mid, antworten: gefragt.length }
})

/** Fragt den Agenten und schreibt seine Antwort in die vorbereitete Nachricht. */
async function laufen(
  botId: string, cid: string, faden: string | null, text: string, antwortId: string,
) {
  const db = useDb()
  try {
    const bedingung = faden
      ? and(eq(schema.botSessions.botId, botId), eq(schema.botSessions.channelId, cid),
            eq(schema.botSessions.threadRootId, faden))
      : and(eq(schema.botSessions.botId, botId), eq(schema.botSessions.channelId, cid),
            isNull(schema.botSessions.threadRootId))
    const [vorhanden] = await db.select().from(schema.botSessions).where(bedingung).limit(1)

    let sitzung = vorhanden?.hermesSessionId ?? null
    if (!sitzung) {
      sitzung = await neueSitzung(botId)
      if (sitzung) {
        await db.insert(schema.botSessions).values({
          id: id('s'), botId, channelId: cid, threadRootId: faden,
          hermesSessionId: sitzung, createdAt: Date.now(),
        })
      }
    }

    const a = await frageBot(botId, text, sitzung)
    await db.update(schema.messages)
      .set({ body: a.text || '(keine Antwort)', state: 'done' })
      .where(eq(schema.messages.id, antwortId))
  } catch (e: any) {
    await db.update(schema.messages)
      .set({
        body: `Fehler beim Aufruf: ${e?.statusMessage || e?.message || 'unbekannt'}`,
        state: 'error',
      })
      .where(eq(schema.messages.id, antwortId))
  }
}
