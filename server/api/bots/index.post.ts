import { useDb, schema } from '~~/server/db'
import { requireAdmin } from '~~/server/utils/auth'
import { id, slugify } from '~~/server/utils/ids'

/**
 * Wire up a bot: name, Hermes profile, the address of its api_server platform
 * and that platform's key.
 *
 * The connection is checked before saving — a bot you cannot reach does not
 * belong in the list, and the error is far easier to understand now than at
 * the first message.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const b = await readBody<any>(event)
  for (const field of ['name', 'profile', 'apiBase', 'apiKey']) {
    if (!b?.[field]) throw createError({ statusCode: 400, statusMessage: `Field missing: ${field}` })
  }

  const base = String(b.apiBase).replace(/\/$/, '')
  try {
    const models = await $fetch<any>(`${base}/v1/models`, {
      headers: { Authorization: `Bearer ${b.apiKey}` }, timeout: 15_000,
    })
    if (models?.error) throw new Error(models.error.message)
  } catch (e: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `Bot not reachable: ${e?.data?.error?.message || e?.message || 'no response'}`,
    })
  }

  const db = useDb()
  const bid = id('b')
  try {
    await db.insert(schema.bots).values({
      id: bid, slug: slugify(b.slug || b.name), name: b.name, profile: b.profile,
      apiBase: base, apiKey: b.apiKey, model: b.model || null,
      color: b.color || '#22d3ee', description: b.description || null,
      operator: b.operator ? 1 : 0,
      active: 1, createdAt: Date.now(),
    })
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'That handle is taken' })
  }
  return { id: bid, name: b.name, profile: b.profile, slug: slugify(b.slug || b.name) }
})
