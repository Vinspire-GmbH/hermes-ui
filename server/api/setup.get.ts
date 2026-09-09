import { useDb, schema } from '~~/server/db'
import { sql } from 'drizzle-orm'

/** Tells the interface whether it has to show the setup step. */
export default defineEventHandler(async () => {
  const db = useDb()
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.users)
  return { configured: n > 0 }
})
