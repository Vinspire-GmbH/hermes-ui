import { useDb, schema } from '~~/server/db'
import { botFromKey } from '~~/server/utils/tokens'
import { eq } from 'drizzle-orm'

/** So a bot can look up where it may write instead of guessing names. */
export default defineEventHandler(async (event) => {
  await botFromKey(event)
  const db = useDb()
  const channels = await db.select().from(schema.channels)
    .where(eq(schema.channels.kind, 'channel'))
  return channels.map(c => ({ slug: c.slug, name: c.name, topic: c.topic }))
})
