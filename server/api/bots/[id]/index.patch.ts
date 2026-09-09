import { useDb, schema } from '~~/server/db'
import { requireAdmin } from '~~/server/utils/auth'
import { slugify } from '~~/server/utils/ids'
import { eq } from 'drizzle-orm'

/**
 * Change a bot. Only the fields that are sent get touched, so a form that
 * shows six fields cannot blank the seventh.
 *
 * An empty `apiKey` means "leave it alone" — the form never receives the
 * current one, so it cannot send it back.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const bid = getRouterParam(event, 'id')!
  const b = await readBody<any>(event)

  const db = useDb()
  const [bot] = await db.select().from(schema.bots).where(eq(schema.bots.id, bid)).limit(1)
  if (!bot) throw createError({ statusCode: 404, statusMessage: 'Unknown bot' })

  const patch: Record<string, unknown> = {}
  if (b.name) patch.name = b.name
  if (b.slug) patch.slug = slugify(b.slug)
  if (b.profile) patch.profile = b.profile
  if (b.apiBase) patch.apiBase = String(b.apiBase).replace(/\/$/, '')
  if (b.apiKey) patch.apiKey = b.apiKey
  if (b.model !== undefined) patch.model = b.model || null
  if (b.color) patch.color = b.color
  if (b.description !== undefined) patch.description = b.description || null
  if (b.operator !== undefined) patch.operator = b.operator ? 1 : 0
  if (b.active !== undefined) patch.active = b.active ? 1 : 0
  if (!Object.keys(patch).length) return { ok: true, unchanged: true }

  try {
    await db.update(schema.bots).set(patch).where(eq(schema.bots.id, bid))
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'That handle is taken' })
  }
  return { ok: true }
})
