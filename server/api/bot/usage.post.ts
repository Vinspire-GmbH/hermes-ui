import { useDb, schema } from '~~/server/db'
import { id } from '~~/server/utils/ids'
import { botFromKey } from '~~/server/utils/tokens'
import { and, eq, isNull } from 'drizzle-orm'

/**
 * Receive a profile's cron usage records.
 *
 * Hermes logs what each scheduled run cost into `cron/usage_audit.jsonl` on
 * the agent host, and no endpoint exposes it — which would leave a cost view
 * covering only the chat and understating the real bill by a wide margin. So
 * the `chat` tool ships those lines here, the same direction reports already
 * travel, authenticated with the same bot key.
 *
 * `fire_id` is the natural key, unique in the table: shipping the whole audit
 * file every day is therefore harmless and needs no bookkeeping on either side.
 */
export default defineEventHandler(async (event) => {
  const bot = await botFromKey(event)
  const body = await readBody<{ records?: any[] }>(event)
  const records = Array.isArray(body?.records) ? body.records : []
  if (!records.length) return { accepted: 0, stored: 0 }
  if (records.length > 2000) {
    throw createError({ statusCode: 413, statusMessage: 'At most 2000 records per call' })
  }

  const db = useDb()
  let stored = 0
  for (const r of records) {
    const ref = r?.fire_id ? `cron:${r.fire_id}` : null
    if (!ref) continue
    const at = Date.parse(r.ts || '') || Date.now()
    try {
      await db.insert(schema.usage).values({
        id: id('use'),
        botId: bot.id,
        kind: 'cron',
        ref,
        jobId: r.job_id || null,
        jobName: r.job_name || null,
        model: r.model || null,
        inputTokens: Number(r.prompt_tokens || 0),
        outputTokens: Number(r.completion_tokens || 0),
        durationMs: Number(r.duration_ms || 0) || null,
        at,
      })
      stored++
    } catch {
      // Unique on `ref` — this run was already shipped. Fill in a name or
      // model that a later shipment knows and the first one did not: Hermes
      // logs only `job_id`, so the name arrives once the tool learned to look
      // it up. Nothing else is touched, so a re-send cannot rewrite history.
      if (r.job_name || r.model) {
        await db.update(schema.usage)
          .set({
            ...(r.job_name ? { jobName: r.job_name } : {}),
            ...(r.model ? { model: r.model } : {}),
          })
          .where(and(
            eq(schema.usage.ref, ref),
            isNull(schema.usage.jobName),
          ))
      }
    }
  }
  return { accepted: records.length, stored }
})
