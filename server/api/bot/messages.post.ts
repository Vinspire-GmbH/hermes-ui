import { useDb, schema } from '~~/server/db'
import { id } from '~~/server/utils/ids'
import { botAusSchluessel } from '~~/server/utils/bottoken'
import { eq, or, and } from 'drizzle-orm'

/**
 * Ein Bot schreibt von außen in einen Kanal — der Weg für Cron-Meldungen.
 *
 *   curl -H "Authorization: Bearer hui-…" -H 'Content-Type: application/json' \
 *        -d '{"kanal":"buchhaltung","text":"Fertig. 3 Rechnungen abgelegt."}' \
 *        https://chat.vinspi.re/api/bot/messages
 *
 * Anders als bei einer Nachricht aus dem Browser wird hier **kein** Agentenlauf
 * angestoßen: der Bot hat schon gearbeitet, er berichtet nur. Erwähnungen im
 * Text lösen deshalb bewusst nichts aus, sonst könnte sich eine Meldung selbst
 * beantworten.
 *
 * Fehlt die Mitgliedschaft, wird sie angelegt statt die Meldung abzuweisen. Ein
 * um 7:00 verlorener Bericht ist teurer als ein Bot, der in einem Kanal auftaucht,
 * in den ihn niemand eingeladen hat — und wer ihn dort nicht will, wirft ihn raus.
 */
export default defineEventHandler(async (event) => {
  const bot = await botAusSchluessel(event)
  const k = await readBody<{ kanal?: string; channel?: string; text?: string; faden?: string }>(event)
  const kanalName = (k.kanal || k.channel || '').replace(/^#/, '').trim()
  const text = (k.text || '').trim()
  if (!kanalName) throw createError({ statusCode: 400, statusMessage: 'Feld fehlt: kanal' })
  if (!text) throw createError({ statusCode: 400, statusMessage: 'Feld fehlt: text' })

  const db = useDb()
  const [kanal] = await db.select().from(schema.channels)
    .where(or(eq(schema.channels.slug, kanalName), eq(schema.channels.id, kanalName)))
    .limit(1)
  if (!kanal) {
    const alle = await db.select({ slug: schema.channels.slug }).from(schema.channels)
      .where(eq(schema.channels.kind, 'channel'))
    throw createError({
      statusCode: 404,
      statusMessage: `Kanal "${kanalName}" gibt es nicht. Vorhanden: ${alle.map(a => a.slug).join(', ') || '—'}`,
    })
  }

  const [mitglied] = await db.select().from(schema.members).where(and(
    eq(schema.members.channelId, kanal.id),
    eq(schema.members.kind, 'bot'),
    eq(schema.members.refId, bot.id),
  )).limit(1)
  if (!mitglied) {
    await db.insert(schema.members).values({
      id: id('m'), channelId: kanal.id, kind: 'bot', refId: bot.id, addedAt: Date.now(),
    })
  }

  const mid = id('msg')
  await db.insert(schema.messages).values({
    id: mid, channelId: kanal.id, threadRootId: k.faden || null,
    authorKind: 'bot', authorId: bot.id, body: text,
    state: 'done', createdAt: Date.now(),
  })
  return { id: mid, kanal: kanal.slug, bot: bot.slug }
})
