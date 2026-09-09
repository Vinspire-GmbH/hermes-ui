import { useDb, schema } from '~~/server/db'
import { requireUser } from '~~/server/utils/auth'
import { listJobs, type CronJob } from '~~/server/utils/hermes'
import { eq } from 'drizzle-orm'

export interface BotCrons {
  bot: { id: string; name: string; slug: string; color: string; profile: string }
  jobs: CronJob[]
  error: string | null
}

/**
 * Every profile's cron jobs, gathered in one call.
 *
 * Asked of all bots at once, and a bot that does not answer becomes an entry
 * with an error rather than a failed request: one unreachable instance must
 * not hide the schedule of the other three. That is the whole reason this
 * aggregates server-side instead of the browser fanning out.
 */
export default defineEventHandler(async (event): Promise<BotCrons[]> => {
  await requireUser(event)
  const db = useDb()
  const bots = await db.select().from(schema.bots).where(eq(schema.bots.active, 1))

  return Promise.all(bots.map(async (b): Promise<BotCrons> => {
    const bot = { id: b.id, name: b.name, slug: b.slug, color: b.color, profile: b.profile }
    try {
      return { bot, jobs: await listJobs(b.id), error: null }
    } catch (e: any) {
      return {
        bot,
        jobs: [],
        error: e?.data?.error?.message || e?.statusMessage || e?.message || 'no response',
      }
    }
  }))
})
