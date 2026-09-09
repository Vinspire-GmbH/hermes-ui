import { useDb, schema } from '~~/server/db'
import { id } from '~~/server/utils/ids'
import { botFromKey } from '~~/server/utils/tokens'
import { notifyChannel, preview } from '~~/server/utils/push'
import { eq, or, and } from 'drizzle-orm'

/**
 * A bot writes into a channel from outside — the route cron reports take.
 *
 *   curl -H "Authorization: Bearer hui-…" -H 'Content-Type: application/json' \
 *        -d '{"channel":"general","text":"Done. Filed 3 invoices."}' \
 *        https://chat.example.com/api/bot/messages
 *
 * Unlike a message from the browser this starts **no** agent run: the bot has
 * already done the work, it is only reporting. Mentions in the text therefore
 * trigger nothing on purpose — otherwise a report could answer itself.
 *
 * If membership is missing it gets created rather than the message rejected. A
 * report lost at 07:00 costs more than a bot turning up in a channel nobody
 * invited it to — and whoever does not want it there removes it.
 *
 * `kanal` is still accepted alongside `channel`: the field was called that in
 * the first release, and the keys sitting in `config.json` on the agent hosts
 * are not worth a broken cron run.
 */
export default defineEventHandler(async (event) => {
  const bot = await botFromKey(event)
  const input = await readBody<{
    channel?: string; kanal?: string; text?: string; thread?: string; faden?: string
  }>(event)
  const channelName = (input.channel || input.kanal || '').replace(/^#/, '').trim()
  const text = (input.text || '').trim()
  const thread = input.thread || input.faden || null
  if (!channelName) throw createError({ statusCode: 400, statusMessage: 'Field missing: channel' })
  if (!text) throw createError({ statusCode: 400, statusMessage: 'Field missing: text' })

  const db = useDb()
  const [channel] = await db.select().from(schema.channels)
    .where(or(eq(schema.channels.slug, channelName), eq(schema.channels.id, channelName)))
    .limit(1)
  if (!channel) {
    const all = await db.select({ slug: schema.channels.slug }).from(schema.channels)
      .where(eq(schema.channels.kind, 'channel'))
    throw createError({
      statusCode: 404,
      statusMessage: `No channel "${channelName}". Available: ${all.map(a => a.slug).join(', ') || '—'}`,
    })
  }

  const [member] = await db.select().from(schema.members).where(and(
    eq(schema.members.channelId, channel.id),
    eq(schema.members.kind, 'bot'),
    eq(schema.members.refId, bot.id),
  )).limit(1)
  if (!member) {
    await db.insert(schema.members).values({
      id: id('m'), channelId: channel.id, kind: 'bot', refId: bot.id, addedAt: Date.now(),
    })
  }

  const mid = id('msg')
  await db.insert(schema.messages).values({
    id: mid, channelId: channel.id, threadRootId: thread,
    authorKind: 'bot', authorId: bot.id, body: text,
    state: 'done', createdAt: Date.now(),
  })

  notifyChannel(channel.id, {
    title: `#${channel.name} · ${bot.name}`,
    body: preview(text),
    url: `/c/${channel.id}`,
    tag: channel.id,
  }).catch(() => {})

  return { id: mid, channel: channel.slug, bot: bot.slug }
})
