import { useDb, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'
import { id, slugify } from '~~/server/utils/ids'
import { eq } from 'drizzle-orm'

/**
 * Create a channel — or open a direct message.
 *
 * With `kind: 'dm'` an existing conversation is reused rather than a new one
 * created every time. Otherwise you would have thirty conversations with the
 * same bot after a week.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<any>(event)
  const db = useDb()
  const now = Date.now()

  if (body?.kind === 'dm') {
    if (!body?.botId) throw createError({ statusCode: 400, statusMessage: 'botId required' })
    const [bot] = await db.select().from(schema.bots)
      .where(eq(schema.bots.id, body.botId)).limit(1)
    if (!bot) throw createError({ statusCode: 404, statusMessage: 'Unknown bot' })

    const slug = `dm-${user.id}-${bot.id}`
    const [existing] = await db.select().from(schema.channels)
      .where(eq(schema.channels.slug, slug)).limit(1)
    if (existing) return existing

    const cid = id('c')
    await db.insert(schema.channels).values({
      id: cid, slug, name: bot.name, kind: 'dm', createdBy: user.id, createdAt: now,
    })
    await db.insert(schema.members).values([
      { id: id('m'), channelId: cid, kind: 'user', refId: user.id, addedAt: now },
      { id: id('m'), channelId: cid, kind: 'bot', refId: bot.id, addedAt: now },
    ])
    const [created] = await db.select().from(schema.channels)
      .where(eq(schema.channels.id, cid)).limit(1)
    return created
  }

  if (!body?.name) throw createError({ statusCode: 400, statusMessage: 'Name required' })
  const cid = id('c')
  try {
    await db.insert(schema.channels).values({
      id: cid, slug: slugify(body.name), name: body.name, topic: body.topic || null,
      kind: 'channel', createdBy: user.id, createdAt: now,
    })
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'That channel already exists' })
  }
  await db.insert(schema.members).values({
    id: id('m'), channelId: cid, kind: 'user', refId: user.id, addedAt: now,
  })
  const [created] = await db.select().from(schema.channels)
    .where(eq(schema.channels.id, cid)).limit(1)
  return created
})
