import { useDb, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'
import { readRun, fetchApproval } from '~~/server/utils/hermes'
import { notifyChannel, preview } from '~~/server/utils/push'
import { eq, and, asc, gt, inArray } from 'drizzle-orm'

/**
 * A channel's messages — and the place where open runs get collected.
 *
 * The interface polls every couple of seconds anyway. Checking run state here
 * saves a background loop and survives any restart: what remains to be done is
 * in the database, not in memory.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const cid = getRouterParam(event, 'id')!
  const { since, thread } = getQuery(event) as { since?: string; thread?: string }
  const db = useDb()

  const [member] = await db.select().from(schema.members).where(and(
    eq(schema.members.channelId, cid),
    eq(schema.members.kind, 'user'),
    eq(schema.members.refId, user.id),
  )).limit(1)
  if (!member) throw createError({ statusCode: 403, statusMessage: 'Not a member of this channel' })

  await collectOpenRuns(cid)

  const filter = [eq(schema.messages.channelId, cid)]
  if (since) filter.push(gt(schema.messages.createdAt, Number(since)))
  if (thread) filter.push(eq(schema.messages.threadRootId, thread))

  return db.select().from(schema.messages)
    .where(and(...filter))
    .orderBy(asc(schema.messages.createdAt))
    .limit(500)
})

async function collectOpenRuns(cid: string) {
  const db = useDb()
  const open = await db.select().from(schema.messages).where(and(
    eq(schema.messages.channelId, cid),
    inArray(schema.messages.state, ['pending', 'approval']),
  ))

  for (const m of open) {
    if (!m.runId) continue
    try {
      const state = await readRun(m.authorId, m.runId)

      // The run has stopped and is asking permission for a command. Fetch the
      // detail once — reading the event stream consumes it — and park the
      // message in the approval state until somebody answers.
      if (state.waitingForApproval) {
        if (m.state === 'approval') continue
        const pending = await fetchApproval(m.authorId, m.runId)
        await db.update(schema.messages).set({
          state: 'approval',
          approval: JSON.stringify(pending ?? {
            choices: ['once', 'session', 'always', 'deny'],
            askedAt: Date.now(),
          }),
        }).where(eq(schema.messages.id, m.id))

        const [bot] = await db.select().from(schema.bots)
          .where(eq(schema.bots.id, m.authorId)).limit(1)
        const [channel] = await db.select().from(schema.channels)
          .where(eq(schema.channels.id, cid)).limit(1)
        // Worth a notification of its own: an approval expires after five
        // minutes, so this is the one message where nobody noticing has a
        // consequence.
        notifyChannel(cid, {
          title: `${bot?.name || 'Bot'} needs permission`,
          body: preview(pending?.command || 'A command is waiting for approval.'),
          url: `/c/${cid}`,
          tag: `${cid}-approval`,
        }).catch(() => {})
        continue
      }

      // It was waiting and is not any more — somebody answered elsewhere, or
      // the five-minute window ran out. Let it fall through and be resolved.
      if (m.state === 'approval' && !state.finished) {
        await db.update(schema.messages)
          .set({ state: 'pending', approval: null })
          .where(eq(schema.messages.id, m.id))
        continue
      }

      if (!state.finished) continue
      const ok = state.status === 'completed' || state.status === 'succeeded'
      const body = state.text || (ok ? '(no answer)' : `Run ended with status: ${state.status}`)
      await db.update(schema.messages).set({
        body, state: ok ? 'done' : 'error', runId: null, approval: null,
      }).where(eq(schema.messages.id, m.id))

      // An answer that lands minutes later is exactly what a notification is
      // for — by then nobody is still looking at the window.
      const [bot] = await db.select().from(schema.bots)
        .where(eq(schema.bots.id, m.authorId)).limit(1)
      const [channel] = await db.select().from(schema.channels)
        .where(eq(schema.channels.id, cid)).limit(1)
      notifyChannel(cid, {
        title: channel?.kind === 'dm' ? (bot?.name || 'Bot') : `#${channel?.name} · ${bot?.name || 'Bot'}`,
        body: preview(body),
        url: `/c/${cid}`,
        tag: cid,
      }).catch(() => {})
    } catch {
      // A hiccup in the status call must not fail the message list — it gets
      // asked again on the next poll, a couple of seconds later.
    }
  }
}
