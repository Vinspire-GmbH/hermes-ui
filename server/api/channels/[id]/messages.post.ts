import { useDb, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'
import { id } from '~~/server/utils/ids'
import { startRun, newSession } from '~~/server/utils/hermes'
import { notifyChannel, preview } from '~~/server/utils/push'
import { and, eq, isNull } from 'drizzle-orm'

/**
 * Send a message — and, if addressed, start an agent run.
 *
 * The run is only **kicked off**, never awaited: `/v1/runs` answers in
 * milliseconds with an identifier. `messages.get` collects the answer once the
 * run is done. That way there is no long-open request — and a restart of the
 * application loses no job in flight, because the identifier is in the row.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const cid = getRouterParam(event, 'id')!
  const { body, thread } = await readBody<{ body?: string; thread?: string | null }>(event)
  if (!body?.trim()) throw createError({ statusCode: 400, statusMessage: 'Empty message' })

  const db = useDb()
  const memberRows = await db.select().from(schema.members)
    .where(eq(schema.members.channelId, cid))
  if (!memberRows.some(m => m.kind === 'user' && m.refId === user.id)) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this channel' })
  }

  const text = body.trim()
  const mid = id('msg')
  await db.insert(schema.messages).values({
    id: mid, channelId: cid, threadRootId: thread || null,
    authorKind: 'user', authorId: user.id, body: text, state: 'done', createdAt: Date.now(),
  })

  const [channel] = await db.select().from(schema.channels)
    .where(eq(schema.channels.id, cid)).limit(1)
  const botsHere = memberRows.filter(m => m.kind === 'bot').map(m => m.refId)

  // Who is meant? In a direct message always the bot; in a channel only
  // whoever is mentioned with @handle — otherwise every word between
  // colleagues sets off four agents and with them four model calls.
  let addressed: string[] = []
  if (channel?.kind === 'dm') {
    addressed = botsHere
  } else if (botsHere.length) {
    const all = await db.select().from(schema.bots)
    addressed = all
      .filter(b => botsHere.includes(b.id))
      .filter(b => new RegExp(`@${b.slug}\\b`, 'i').test(text))
      .map(b => b.id)
  }

  for (const botId of addressed) {
    const replyId = id('msg')
    try {
      const session = await sessionFor(botId, cid, thread || null)
      const runId = await startRun(botId, text, session)
      await db.insert(schema.messages).values({
        id: replyId, channelId: cid, threadRootId: thread || null,
        authorKind: 'bot', authorId: botId, body: '', state: 'pending',
        runId, createdAt: Date.now(),
      })
    } catch (e: any) {
      await db.insert(schema.messages).values({
        id: replyId, channelId: cid, threadRootId: thread || null,
        authorKind: 'bot', authorId: botId,
        body: `The run would not start: ${e?.statusMessage || e?.message || 'unknown reason'}`,
        state: 'error', createdAt: Date.now(),
      })
    }
  }

  // People in the channel hear about it; the author does not need telling.
  notifyChannel(cid, {
    title: channel?.kind === 'dm' ? user.name : `#${channel?.name} · ${user.name}`,
    body: preview(text),
    url: `/c/${cid}`,
    tag: cid,
  }, user.id).catch(() => {})

  return { id: mid, runs: addressed.length }
})

/** One Hermes session per bot and strand, so the history survives. */
async function sessionFor(botId: string, cid: string, thread: string | null) {
  const db = useDb()
  const where = thread
    ? and(eq(schema.botSessions.botId, botId), eq(schema.botSessions.channelId, cid),
          eq(schema.botSessions.threadRootId, thread))
    : and(eq(schema.botSessions.botId, botId), eq(schema.botSessions.channelId, cid),
          isNull(schema.botSessions.threadRootId))
  const [existing] = await db.select().from(schema.botSessions).where(where).limit(1)
  if (existing) return existing.hermesSessionId

  const created = await newSession(botId)
  if (created) {
    await db.insert(schema.botSessions).values({
      id: id('s'), botId, channelId: cid, threadRootId: thread,
      hermesSessionId: created, createdAt: Date.now(),
    })
  }
  return created
}
