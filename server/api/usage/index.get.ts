import { useDb, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'
import { pricedModels } from '~~/server/utils/pricing'
import { gte } from 'drizzle-orm'

/**
 * What the agents cost over a window.
 *
 * The figures are Hermes' own — see `server/api/bot/usage.post.ts` for why
 * they are not computed here. This endpoint only groups them: per agent,
 * per scheduled job, per day, plus the four token buckets so the shape of the
 * bill is visible. Cache reads dominating the token count while contributing
 * little to the cost is the single most useful thing to see here.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const { days } = getQuery(event) as { days?: string }
  const window = Math.min(Math.max(Number(days) || 30, 1), 365)
  const since = Date.now() - window * 86400000

  const db = useDb()
  const rows = await db.select().from(schema.usage).where(gte(schema.usage.at, since))
  const bots = await db.select().from(schema.bots)
  const meta = new Map(bots.map(b => [b.id, { name: b.name, colour: b.color }]))

  interface Bucket {
    key: string
    label: string
    colour?: string
    runs: number
    apiCalls: number
    input: number
    cacheRead: number
    cacheWrite: number
    output: number
    usd: number
    unpriced: number
  }
  const empty = (key: string, label: string, colour?: string): Bucket => ({
    key, label, colour,
    runs: 0, apiCalls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0,
    usd: 0, unpriced: 0,
  })

  const perBot = new Map<string, Bucket>()
  const perJob = new Map<string, Bucket>()
  const perDay = new Map<string, { day: string; usd: number }>()
  const total = empty('total', 'total')
  // How much of the figure comes from where, because the three deserve
  // different trust: a provider's own number, Hermes' estimate, ours.
  const bySource: Record<string, number> = {}

  for (const r of rows) {
    const bot = meta.get(r.botId)
    const usd = r.costUsd ?? 0
    const add = (b: Bucket) => {
      b.runs++
      b.apiCalls += r.apiCalls
      b.input += r.inputTokens
      b.cacheRead += r.cacheReadTokens
      b.cacheWrite += r.cacheWriteTokens
      b.output += r.outputTokens
      b.usd += usd
      if (r.costUsd === null) b.unpriced++
    }
    add(total)

    const botKey = r.botId
    if (!perBot.has(botKey)) perBot.set(botKey, empty(botKey, bot?.name || r.botId, bot?.colour))
    add(perBot.get(botKey)!)

    if (r.kind === 'cron' && (r.jobName || r.jobId)) {
      const key = `${r.botId}:${r.jobName || r.jobId}`
      if (!perJob.has(key)) {
        perJob.set(key, empty(key, r.jobName || r.jobId!, bot?.colour))
      }
      add(perJob.get(key)!)
    }

    const day = new Date(r.at).toISOString().slice(0, 10)
    const d = perDay.get(day) || { day, usd: 0 }
    d.usd += usd
    perDay.set(day, d)

    const src = r.costSource || 'unknown'
    bySource[src] = (bySource[src] || 0) + usd
  }

  const bySize = (a: Bucket, b: Bucket) => b.usd - a.usd || b.cacheRead - a.cacheRead
  const days_ = [...perDay.values()].sort((a, b) => a.day.localeCompare(b.day))

  return {
    window,
    total,
    // Extrapolating from the days that actually carry data, not from the
    // window: a fresh installation would otherwise look cheap.
    perMonth: days_.length ? (total.usd / days_.length) * 30 : 0,
    coveredDays: days_.length,
    bots: [...perBot.values()].sort(bySize),
    jobs: [...perJob.values()].sort(bySize),
    days: days_,
    bySource,
    pricedModels: pricedModels(),
  }
})
