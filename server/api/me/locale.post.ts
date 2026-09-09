import { useDb, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'
import { eq } from 'drizzle-orm'

/** Remember the chosen language on the account, so a new browser starts right. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { locale } = await readBody<{ locale?: string }>(event)
  if (locale !== 'en' && locale !== 'de') {
    throw createError({ statusCode: 400, statusMessage: 'Unknown locale' })
  }
  await useDb().update(schema.users).set({ locale })
    .where(eq(schema.users.id, user.id))
  return { ok: true }
})
