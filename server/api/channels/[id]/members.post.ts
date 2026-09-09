import { useDb, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'
import { id } from '~~/server/utils/ids'
import { and, eq } from 'drizzle-orm'

/** Invite a bot or a colleague into a channel. Members may invite. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const cid = getRouterParam(event, 'id')!
  const { kind, refId } = await readBody<{ kind?: 'user' | 'bot'; refId?: string }>(event)
  if (kind !== 'user' && kind !== 'bot') {
    throw createError({ statusCode: 400, statusMessage: 'kind must be user or bot' })
  }
  if (!refId) throw createError({ statusCode: 400, statusMessage: 'refId required' })

  const db = useDb()
  const [self] = await db.select().from(schema.members).where(and(
    eq(schema.members.channelId, cid),
    eq(schema.members.kind, 'user'),
    eq(schema.members.refId, user.id),
  )).limit(1)
  if (!self) throw createError({ statusCode: 403, statusMessage: 'Not a member of this channel' })

  const [channel] = await db.select().from(schema.channels)
    .where(eq(schema.channels.id, cid)).limit(1)
  if (channel?.kind === 'dm') {
    throw createError({ statusCode: 400, statusMessage: 'You do not invite anyone into a direct message' })
  }

  try {
    await db.insert(schema.members).values({
      id: id('m'), channelId: cid, kind, refId, addedAt: Date.now(),
    })
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'Already a member' })
  }

  const [bot] = kind === 'bot'
    ? await db.select().from(schema.bots).where(eq(schema.bots.id, refId)).limit(1)
    : [null as any]
  const [invited] = kind === 'user'
    ? await db.select().from(schema.users).where(eq(schema.users.id, refId)).limit(1)
    : [null as any]

  await db.insert(schema.messages).values({
    id: id('msg'), channelId: cid, threadRootId: null,
    authorKind: 'system', authorId: user.id,
    body: kind === 'bot'
      ? `${user.name} invited @${bot?.slug ?? refId}. Mention the bot with @${bot?.slug ?? ''} to get an answer.`
      : `${user.name} invited ${invited?.name ?? 'a colleague'}.`,
    state: 'done', createdAt: Date.now(),
  })
  return { ok: true }
})
