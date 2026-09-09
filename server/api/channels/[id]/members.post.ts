import { useDb, schema } from '~~/server/db'
import { angemeldet } from '~~/server/utils/auth'
import { id } from '~~/server/utils/ids'
import { eq, and } from 'drizzle-orm'

/** Bot oder Kollegen in einen Kanal einladen. Mitglieder dürfen einladen. */
export default defineEventHandler(async (event) => {
  const u = await angemeldet(event)
  const cid = getRouterParam(event, 'id')!
  const { kind, refId } = await readBody<{ kind?: 'user' | 'bot'; refId?: string }>(event)
  if (kind !== 'user' && kind !== 'bot') {
    throw createError({ statusCode: 400, statusMessage: 'kind muss user oder bot sein' })
  }
  if (!refId) throw createError({ statusCode: 400, statusMessage: 'refId nötig' })

  const db = useDb()
  const [selbst] = await db.select().from(schema.members).where(and(
    eq(schema.members.channelId, cid),
    eq(schema.members.kind, 'user'),
    eq(schema.members.refId, u.id),
  )).limit(1)
  if (!selbst) throw createError({ statusCode: 403, statusMessage: 'Kein Mitglied dieses Kanals' })

  const [kanal] = await db.select().from(schema.channels)
    .where(eq(schema.channels.id, cid)).limit(1)
  if (kanal?.kind === 'dm') {
    throw createError({ statusCode: 400, statusMessage: 'In eine Direktnachricht lädt man niemanden ein' })
  }

  try {
    await db.insert(schema.members).values({
      id: id('m'), channelId: cid, kind, refId, addedAt: Date.now(),
    })
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'Schon Mitglied' })
  }

  const [b] = kind === 'bot'
    ? await db.select().from(schema.bots).where(eq(schema.bots.id, refId)).limit(1)
    : [null as any]
  await db.insert(schema.messages).values({
    id: id('msg'), channelId: cid, threadRootId: null,
    authorKind: 'system', authorId: u.id,
    body: kind === 'bot'
      ? `${u.name} hat @${b?.slug ?? refId} eingeladen. Erwähne den Bot mit @${b?.slug ?? ''}, damit er antwortet.`
      : `${u.name} hat einen Kollegen eingeladen.`,
    state: 'done', createdAt: Date.now(),
  })
  return { ok: true }
})
