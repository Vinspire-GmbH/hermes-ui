import { useDb, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'
import { stopRun } from '~~/server/utils/hermes'
import { and, eq } from 'drizzle-orm'

/**
 * Call off a run that is still going.
 *
 * The case this exists for: an agent answers a small question by starting a
 * web crawl, and without this you can only wait for it. Hermes winds the run
 * down rather than killing it mid-tool, so the agent may still produce a short
 * answer — which is why the message is left to the reconciliation pass instead
 * of being overwritten here.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const cid = getRouterParam(event, 'id')!
  const { messageId } = await readBody<{ messageId?: string }>(event)
  if (!messageId) throw createError({ statusCode: 400, statusMessage: 'messageId required' })

  const db = useDb()
  const [member] = await db.select().from(schema.members).where(and(
    eq(schema.members.channelId, cid),
    eq(schema.members.kind, 'user'),
    eq(schema.members.refId, user.id),
  )).limit(1)
  if (!member) throw createError({ statusCode: 403, statusMessage: 'Not a member of this channel' })

  const [message] = await db.select().from(schema.messages)
    .where(and(eq(schema.messages.id, messageId), eq(schema.messages.channelId, cid)))
    .limit(1)
  if (!message?.runId) {
    throw createError({ statusCode: 409, statusMessage: 'Nothing is running here' })
  }

  try {
    await stopRun(message.authorId, message.runId)
  } catch (e: any) {
    throw createError({
      statusCode: 502,
      statusMessage: e?.data?.error?.message || e?.statusMessage || 'The run would not stop',
    })
  }
  await db.update(schema.messages)
    .set({ progress: JSON.stringify({ stopping: true, at: Date.now() }) })
    .where(eq(schema.messages.id, message.id))
  return { ok: true }
})
