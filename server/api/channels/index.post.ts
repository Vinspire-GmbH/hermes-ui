import { useDb, schema } from '~~/server/db'
import { angemeldet } from '~~/server/utils/auth'
import { id, slugify } from '~~/server/utils/ids'
import { eq, and } from 'drizzle-orm'

/**
 * Kanal anlegen — oder eine Direktnachricht öffnen.
 *
 * Bei `kind: 'dm'` mit einem Bot wird eine bestehende DM wiederverwendet,
 * statt jedes Mal eine neue anzulegen. Sonst hätte man nach einer Woche
 * dreißig Unterhaltungen mit Konrad.
 */
export default defineEventHandler(async (event) => {
  const u = await angemeldet(event)
  const b = await readBody<any>(event)
  const db = useDb()
  const jetzt = Date.now()

  if (b?.kind === 'dm') {
    if (!b?.botId) throw createError({ statusCode: 400, statusMessage: 'botId nötig' })
    const [bot] = await db.select().from(schema.bots).where(eq(schema.bots.id, b.botId)).limit(1)
    if (!bot) throw createError({ statusCode: 404, statusMessage: 'Bot unbekannt' })

    const slug = `dm-${u.id}-${bot.id}`
    const [vorhanden] = await db.select().from(schema.channels)
      .where(eq(schema.channels.slug, slug)).limit(1)
    if (vorhanden) return vorhanden

    const cid = id('c')
    await db.insert(schema.channels).values({
      id: cid, slug, name: bot.name, kind: 'dm', createdBy: u.id, createdAt: jetzt,
    })
    await db.insert(schema.members).values([
      { id: id('m'), channelId: cid, kind: 'user', refId: u.id, addedAt: jetzt },
      { id: id('m'), channelId: cid, kind: 'bot', refId: bot.id, addedAt: jetzt },
    ])
    const [neu] = await db.select().from(schema.channels).where(eq(schema.channels.id, cid)).limit(1)
    return neu
  }

  if (!b?.name) throw createError({ statusCode: 400, statusMessage: 'Name nötig' })
  const cid = id('c')
  try {
    await db.insert(schema.channels).values({
      id: cid, slug: slugify(b.name), name: b.name, topic: b.topic || null,
      kind: 'channel', createdBy: u.id, createdAt: jetzt,
    })
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'Kanal gibt es schon' })
  }
  await db.insert(schema.members).values({
    id: id('m'), channelId: cid, kind: 'user', refId: u.id, addedAt: jetzt,
  })
  const [neu] = await db.select().from(schema.channels).where(eq(schema.channels.id, cid)).limit(1)
  return neu
})
