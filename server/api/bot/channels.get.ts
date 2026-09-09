import { useDb, schema } from '~~/server/db'
import { botAusSchluessel } from '~~/server/utils/bottoken'
import { eq } from 'drizzle-orm'

/** Damit ein Bot nachsehen kann, wohin er schreiben darf, statt Namen zu raten. */
export default defineEventHandler(async (event) => {
  await botAusSchluessel(event)
  const db = useDb()
  const kanaele = await db.select().from(schema.channels)
    .where(eq(schema.channels.kind, 'channel'))
  return kanaele.map(c => ({ slug: c.slug, name: c.name, topic: c.topic }))
})
