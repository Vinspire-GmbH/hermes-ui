import { useDb, schema } from '~~/server/db'
import { sql } from 'drizzle-orm'

/** Sagt der Oberfläche, ob sie den Einrichtungsschritt zeigen muss. */
export default defineEventHandler(async () => {
  const db = useDb()
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.users)
  return { eingerichtet: n > 0 }
})
