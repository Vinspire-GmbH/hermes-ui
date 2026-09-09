import { useDb, schema } from '~~/server/db'
import { istAdmin } from '~~/server/utils/auth'
import { id, slugify } from '~~/server/utils/ids'

/**
 * Einen Bot verdrahten: Name, Hermes-Profil, Adresse seiner api_server-
 * Plattform und dessen Schlüssel.
 *
 * Vor dem Speichern wird die Verbindung geprüft — ein Bot, den man nicht
 * erreicht, gehört nicht in die Liste.
 */
export default defineEventHandler(async (event) => {
  await istAdmin(event)
  const b = await readBody<any>(event)
  for (const f of ['name', 'profile', 'apiBase', 'apiKey']) {
    if (!b?.[f]) throw createError({ statusCode: 400, statusMessage: `Feld fehlt: ${f}` })
  }

  const basis = String(b.apiBase).replace(/\/$/, '')
  try {
    const modelle = await $fetch<any>(`${basis}/v1/models`, {
      headers: { Authorization: `Bearer ${b.apiKey}` }, timeout: 15_000,
    })
    if (modelle?.error) throw new Error(modelle.error.message)
  } catch (e: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `Bot nicht erreichbar: ${e?.data?.error?.message || e?.message || 'unbekannt'}`,
    })
  }

  const db = useDb()
  const bid = id('b')
  try {
    await db.insert(schema.bots).values({
      id: bid, slug: slugify(b.slug || b.name), name: b.name, profile: b.profile,
      apiBase: basis, apiKey: b.apiKey, model: b.model || null,
      color: b.color || '#4f8a8b', description: b.description || null,
      active: 1, createdAt: Date.now(),
    })
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'Kürzel schon vergeben' })
  }
  return { id: bid, name: b.name, profile: b.profile }
})
