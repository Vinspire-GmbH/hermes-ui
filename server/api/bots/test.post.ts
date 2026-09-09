import { requireAdmin } from '~~/server/utils/auth'

/**
 * Try an api_server address before it is saved.
 *
 * Returns the model ids the instance reports, because that is the value that
 * belongs in the `model` field — and getting it wrong is the mistake that
 * costs the most time.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { apiBase, apiKey } = await readBody<{ apiBase?: string; apiKey?: string }>(event)
  if (!apiBase || !apiKey) {
    throw createError({ statusCode: 400, statusMessage: 'Address and key required' })
  }
  const base = apiBase.replace(/\/$/, '')
  try {
    const r = await $fetch<any>(`${base}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15_000,
    })
    if (r?.error) throw new Error(r.error.message)
    const models = (r?.data || []).map((m: any) => m?.id).filter(Boolean)
    return { ok: true, models }
  } catch (e: any) {
    return {
      ok: false,
      reason: e?.data?.error?.message || e?.message || 'no response',
    }
  }
})
