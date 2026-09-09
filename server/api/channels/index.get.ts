import { useDb, schema } from '~~/server/db'
import { angemeldet } from '~~/server/utils/auth'
import { eq, and, inArray } from 'drizzle-orm'

/** Kanäle und Direktnachrichten, in denen der Angemeldete Mitglied ist. */
export default defineEventHandler(async (event) => {
  const u = await angemeldet(event)
  const db = useDb()

  const meine = await db.select({ channelId: schema.members.channelId })
    .from(schema.members)
    .where(and(eq(schema.members.kind, 'user'), eq(schema.members.refId, u.id)))
  const ids = meine.map(m => m.channelId)
  if (!ids.length) return []

  const kanaele = await db.select().from(schema.channels)
    .where(inArray(schema.channels.id, ids))
  const mitglieder = await db.select().from(schema.members)
    .where(inArray(schema.members.channelId, ids))

  return kanaele
    .map(k => ({
      ...k,
      mitglieder: mitglieder.filter(m => m.channelId === k.id)
        .map(m => ({ kind: m.kind, refId: m.refId })),
    }))
    .sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : (a.kind === 'channel' ? -1 : 1))
})
