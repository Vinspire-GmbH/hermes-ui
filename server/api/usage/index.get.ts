import { useDb, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'
import { cost, pricedModels } from '~~/server/utils/pricing'
import { gte } from 'drizzle-orm'

/**
 * What the agents cost over a window.
 *
 * Aggregated per bot and per scheduled job, because those are the two
 * questions worth asking: which agent is expensive, and which nightly job is
 * expensive. A run on a model this instance cannot price is counted in tokens
 * and left out of the money total rather than treated as free — `unpriced`
 * says how many.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const { days } = getQuery(event) as { days?: string }
  const window = Math.min(Math.max(Number(days) || 30, 1), 365)
  const since = Date.now() - window * 86400000

  const db = useDb()
  const rows = await db.select().from(schema.usage)
    .where(gte(schema.usage.at, since))
  const bots = await db.select().from(schema.bots)
  const nameOf = new Map(bots.map(b => [b.id, { name: b.name, color: b.color, model: b.model }]))

  interface Bucket {
    key: string
    label: string
    colour?: string
    kind: string
    runs: number
    input: number
    output: number
    usd: number
    unpriced: number
  }
  const perBot = new Map<string, Bucket>()
  const perJob = new Map<string, Bucket>()
  const perDay = new Map<string, { day: string; usd: number; input: number; output: number }>()
  let totalUsd = 0, totalIn = 0, totalOut = 0, unpriced = 0

  for (const r of rows) {
    const bot = nameOf.get(r.botId)
    // A cron record carries no model of its own in every Hermes version, so
    // fall back to what the bot is configured with.
    const model = r.model || bot?.model || null
    const usd = cost(model, r.inputTokens, r.outputTokens)
    if (usd === null) unpriced++
    totalUsd += usd || 0
    totalIn += r.inputTokens
    totalOut += r.outputTokens

    const add = (map: Map<string, Bucket>, key: string, label: string, kind: string) => {
      const b = map.get(key) || {
        key, label, colour: bot?.color, kind,
        runs: 0, input: 0, output: 0, usd: 0, unpriced: 0,
      }
      b.runs++
      b.input += r.inputTokens
      b.output += r.outputTokens
      b.usd += usd || 0
      if (usd === null) b.unpriced++
      map.set(key, b)
    }
    add(perBot, r.botId, bot?.name || r.botId, 'bot')
    if (r.kind === 'cron' && r.jobId) {
      add(perJob, `${r.botId}:${r.jobId}`, r.jobName || r.jobId, 'cron')
    }

    const day = new Date(r.at).toISOString().slice(0, 10)
    const d = perDay.get(day) || { day, usd: 0, input: 0, output: 0 }
    d.usd += usd || 0
    d.input += r.inputTokens
    d.output += r.outputTokens
    perDay.set(day, d)
  }

  const bySize = (a: Bucket, b: Bucket) => b.usd - a.usd || b.input - a.input
  return {
    window,
    total: { usd: totalUsd, input: totalIn, output: totalOut, runs: rows.length, unpriced },
    bots: [...perBot.values()].sort(bySize),
    jobs: [...perJob.values()].sort(bySize),
    days: [...perDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    pricedModels: pricedModels(),
  }
})
