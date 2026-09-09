import { useDb, schema } from '~~/server/db'
import { id } from '~~/server/utils/ids'
import { botFromKey } from '~~/server/utils/tokens'
import { cost } from '~~/server/utils/pricing'
import { and, eq, isNull } from 'drizzle-orm'

/**
 * Receive a profile's session accounting.
 *
 * Hermes keeps this in the `sessions` table of each profile's `state.db`: the
 * four token buckets kept apart, and a cost figure it computed with its own
 * price table. No endpoint exposes it, so the `chat` tool ships it — the same
 * direction reports already travel, with the same bot key.
 *
 * The cost is taken, not derived. Deriving it here is what produced a figure
 * five times too high: Hermes' cron audit reports `prompt_tokens`, which is
 * `input + cache_read + cache_write`, and pricing that sum at the input rate
 * ignores that cache reads cost a tenth. Local pricing survives only as the
 * fallback for a model Hermes could not price.
 *
 * `ref` is `session:<id>`, unique — so shipping an overlapping range is free,
 * and a record whose cost arrives later still gets filled in.
 */
export default defineEventHandler(async (event) => {
  const bot = await botFromKey(event)
  const body = await readBody<{ records?: any[] }>(event)
  const records = Array.isArray(body?.records) ? body.records : []
  if (!records.length) return { accepted: 0, stored: 0, updated: 0 }
  if (records.length > 500) {
    throw createError({ statusCode: 413, statusMessage: 'At most 500 records per call' })
  }

  const db = useDb()
  let stored = 0
  let updated = 0

  for (const r of records) {
    const ref = typeof r?.ref === 'string' && r.ref ? r.ref : null
    if (!ref) continue

    const buckets = {
      input: Number(r.input_tokens || 0),
      cacheRead: Number(r.cache_read_tokens || 0),
      cacheWrite: Number(r.cache_write_tokens || 0),
      output: Number(r.output_tokens || 0),
    }
    const model = r.model || bot.model || null

    // Hermes' figure wins. Only when it has none does this application price
    // the four buckets itself, and it says so through `costSource`.
    let costUsd: number | null = typeof r.cost_usd === 'number' ? r.cost_usd : null
    let costSource: string = r.cost_status === 'actual' ? 'actual' : 'estimated'
    if (costUsd === null) {
      costUsd = cost(model, buckets)
      costSource = costUsd === null ? 'unpriced' : 'local'
    }

    const at = r.at_epoch
      ? Math.round(Number(r.at_epoch) * 1000)
      : (Date.parse(r.ts || '') || Date.now())

    const values = {
      botId: bot.id,
      kind: r.source === 'cron' ? ('cron' as const) : ('chat' as const),
      source: r.source || null,
      title: r.title || null,
      jobId: r.job_id || null,
      jobName: r.job_name || null,
      model,
      apiCalls: Number(r.api_calls || 0),
      inputTokens: buckets.input,
      cacheReadTokens: buckets.cacheRead,
      cacheWriteTokens: buckets.cacheWrite,
      outputTokens: buckets.output,
      costUsd,
      costSource,
      durationMs: Number(r.duration_ms || 0) || null,
      at,
    }

    try {
      await db.insert(schema.usage).values({ id: id('use'), ref, ...values })
      stored++
    } catch {
      // Already here. A session grows while it is open — more calls, more
      // tokens, a higher cost — so the row is brought up to date rather than
      // left at whatever the first shipment saw. `at` and `ref` stay put.
      const { at: _ignored, ...movable } = values
      await db.update(schema.usage).set(movable)
        .where(eq(schema.usage.ref, ref))
      updated++
    }
  }
  return { accepted: records.length, stored, updated }
})
