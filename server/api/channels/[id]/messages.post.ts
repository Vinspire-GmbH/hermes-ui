import { useDb, schema } from '~~/server/db'
import { angemeldet } from '~~/server/utils/auth'
import { id } from '~~/server/utils/ids'
import { laufStarten, neueSitzung } from '~~/server/utils/hermes'
import { eq, and, isNull } from 'drizzle-orm'

/**
 * Nachricht senden — und, falls angesprochen, einen Agentenlauf starten.
 *
 * Der Lauf wird nur **angestoßen**, nicht abgewartet: `/v1/runs` antwortet in
 * Millisekunden mit einer Kennung. Die Antwort holt `messages.get` nach, sobald
 * der Lauf fertig ist. Damit gibt es keine lange offene Anfrage — und ein
 * Neustart der Anwendung verliert keinen laufenden Auftrag, weil die Kennung
 * in der Nachricht steht.
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

  const text = body.trim()
  const mid = id('msg')
  await db.insert(schema.messages).values({
    id: mid, channelId: cid, threadRootId: faden || null,
    authorKind: 'user', authorId: u.id, body: text, state: 'done', createdAt: Date.now(),
  })

  const [kanal] = await db.select().from(schema.channels)
    .where(eq(schema.channels.id, cid)).limit(1)
  const botsImKanal = mitglieder.filter(m => m.kind === 'bot').map(m => m.refId)

  // Wer ist gemeint? In einer Direktnachricht immer der Bot; in einem Kanal
  // nur, wer mit @kürzel erwähnt wird — sonst löst jeder Zuruf zwischen
  // Kollegen vier Agenten und damit vier Modellaufrufe aus.
  let gefragt: string[] = []
  if (kanal?.kind === 'dm') {
    gefragt = botsImKanal
  } else if (botsImKanal.length) {
    const alle = await db.select().from(schema.bots)
    gefragt = alle
      .filter(b => botsImKanal.includes(b.id))
      .filter(b => new RegExp(`@${b.slug}\\b`, 'i').test(text))
      .map(b => b.id)
  }

  for (const botId of gefragt) {
    const antwortId = id('msg')
    try {
      const sitzung = await sitzungFuer(botId, cid, faden || null)
      const runId = await laufStarten(botId, text, sitzung)
      await db.insert(schema.messages).values({
        id: antwortId, channelId: cid, threadRootId: faden || null,
        authorKind: 'bot', authorId: botId, body: '', state: 'pending',
        runId, createdAt: Date.now(),
      })
    } catch (e: any) {
      await db.insert(schema.messages).values({
        id: antwortId, channelId: cid, threadRootId: faden || null,
        authorKind: 'bot', authorId: botId,
        body: `Der Lauf ließ sich nicht starten: ${e?.statusMessage || e?.message || 'unbekannt'}`,
        state: 'error', createdAt: Date.now(),
      })
    }
  }

  return { id: mid, laeufe: gefragt.length }
})

/** Eine Hermes-Sitzung je Bot und Gesprächsstrang, damit der Verlauf erhalten bleibt. */
async function sitzungFuer(botId: string, cid: string, faden: string | null) {
  const db = useDb()
  const bedingung = faden
    ? and(eq(schema.botSessions.botId, botId), eq(schema.botSessions.channelId, cid),
          eq(schema.botSessions.threadRootId, faden))
    : and(eq(schema.botSessions.botId, botId), eq(schema.botSessions.channelId, cid),
          isNull(schema.botSessions.threadRootId))
  const [vorhanden] = await db.select().from(schema.botSessions).where(bedingung).limit(1)
  if (vorhanden) return vorhanden.hermesSessionId

  const neu = await neueSitzung(botId)
  if (neu) {
    await db.insert(schema.botSessions).values({
      id: id('s'), botId, channelId: cid, threadRootId: faden,
      hermesSessionId: neu, createdAt: Date.now(),
    })
  }
  return neu
}
