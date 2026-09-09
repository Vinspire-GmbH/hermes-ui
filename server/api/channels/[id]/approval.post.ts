import { useDb, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'
import { resolveApproval } from '~~/server/utils/hermes'
import { and, eq } from 'drizzle-orm'

/**
 * Answer a pending approval: allow the command or refuse it.
 *
 * Membership in the channel is the permission here, not the admin role — the
 * person the agent is talking to is the one who should answer, and the run is
 * blocked until they do. `always` writes the command to the profile's
 * permanent allowlist on the Hermes side, which is the one choice worth
 * pausing over.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const cid = getRouterParam(event, 'id')!
  const { messageId, choice } = await readBody<{ messageId?: string; choice?: string }>(event)

  if (!messageId) throw createError({ statusCode: 400, statusMessage: 'messageId required' })
  if (!['once', 'session', 'always', 'deny'].includes(String(choice))) {
    throw createError({
      statusCode: 400,
      statusMessage: 'choice must be once, session, always or deny',
    })
  }

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
  if (!message) throw createError({ statusCode: 404, statusMessage: 'Unknown message' })
  if (message.state !== 'approval' || !message.runId) {
    throw createError({ statusCode: 409, statusMessage: 'Nothing is waiting for approval here' })
  }

  try {
    await resolveApproval(message.authorId, message.runId, choice as any)
  } catch (e: any) {
    // The commonest failure is a window that has closed: an approval expires
    // after five minutes, and Hermes then answers 409. Say so plainly instead
    // of leaving the message parked forever.
    const detail = e?.data?.error?.message || e?.statusMessage || e?.message || 'unknown'
    await db.update(schema.messages).set({
      state: 'error', approval: null, runId: null,
      body: `The approval could not be passed on: ${detail}. `
        + 'It may have expired — ask again.',
    }).where(eq(schema.messages.id, message.id))
    throw createError({ statusCode: 409, statusMessage: detail })
  }

  // Back to waiting: the agent carries on, and the next poll collects it.
  await db.update(schema.messages)
    .set({ state: 'pending', approval: null })
    .where(eq(schema.messages.id, message.id))
  return { ok: true, choice }
})
