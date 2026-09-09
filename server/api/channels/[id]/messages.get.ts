import { useDb, schema } from '~~/server/db'
import { angemeldet } from '~~/server/utils/auth'
import { eq, and, asc, gt } from 'drizzle-orm'

/**
 * Nachrichten eines Kanals. Mit `?seit=<zeitstempel>` nur die neueren —
 * damit das Nachfragen der Oberfläche nicht jedes Mal alles überträgt.
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

  const filter = [eq(schema.messages.channelId, cid)]
  if (seit) filter.push(gt(schema.messages.createdAt, Number(seit)))
  if (faden) filter.push(eq(schema.messages.threadRootId, faden))

  return db.select().from(schema.messages)
    .where(and(...filter))
    .orderBy(asc(schema.messages.createdAt))
    .limit(500)
})
