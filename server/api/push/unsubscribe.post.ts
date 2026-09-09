import { useDb, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'
import { and, eq } from 'drizzle-orm'

/** Forget this browser. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { endpoint } = await readBody<{ endpoint?: string }>(event)
  if (!endpoint) throw createError({ statusCode: 400, statusMessage: 'endpoint missing' })
  await useDb().delete(schema.pushSubscriptions).where(and(
    eq(schema.pushSubscriptions.endpoint, endpoint),
    eq(schema.pushSubscriptions.userId, user.id),
  ))
  return { ok: true }
})
