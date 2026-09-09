import { useDb, schema } from '../db'
import { eq } from 'drizzle-orm'

async function getBot(botId: string) {
  const db = useDb()
  const [bot] = await db.select().from(schema.bots).where(eq(schema.bots.id, botId)).limit(1)
  if (!bot) throw createError({ statusCode: 404, statusMessage: 'Unknown bot' })
  return bot
}

function headers(bot: any, session?: string | null) {
  const h: Record<string, string> = {
    Authorization: `Bearer ${bot.apiKey}`,
    'Content-Type': 'application/json',
  }
  if (session) h['X-Hermes-Session-Id'] = session
  return h
}

/**
 * Start an agent run and return its identifier immediately.
 *
 * Going through `/v1/runs` rather than `/v1/chat/completions` is the crux: an
 * agent that is working needs minutes. Measured on a bot that answered a
 * question by starting a web crawl — after three minutes it was still going. A
 * blocking call runs into a timeout no matter how generous it is. `/v1/runs`
 * answers in milliseconds with an identifier; the result is collected after.
 */
export async function startRun(
  botId: string, text: string, session: string | null,
): Promise<string> {
  const bot = await getBot(botId)
  const r = await $fetch<any>(`${bot.apiBase.replace(/\/$/, '')}/v1/runs`, {
    method: 'POST',
    headers: headers(bot, session),
    body: { model: bot.model || 'hermes-agent', input: text },
    timeout: 30_000,
  })
  if (r?.error) throw createError({ statusCode: 502, statusMessage: r.error.message })
  if (!r?.run_id) throw createError({ statusCode: 502, statusMessage: 'Hermes returned no run id' })
  return r.run_id
}

export interface RunState {
  status: string
  finished: boolean
  text: string
  session: string | null
}

/** Ask after a running job. Nothing here blocks. */
export async function readRun(botId: string, runId: string): Promise<RunState> {
  const bot = await getBot(botId)
  const r = await $fetch<any>(`${bot.apiBase.replace(/\/$/, '')}/v1/runs/${runId}`, {
    headers: headers(bot),
    timeout: 20_000,
  })
  const status = String(r?.status || 'unknown')
  const finished = ['completed', 'failed', 'cancelled', 'error', 'waiting_for_approval']
    .includes(status)
  const text = extractText(r)
  return { status, finished, text, session: r?.session_id || null }
}

/**
 * Dig the answer out of a finished run.
 *
 * The shape varies by Hermes version and by how the run ended, so this reads
 * defensively rather than trusting one path: whatever it finds first that is
 * a non-empty string wins.
 */
function extractText(r: any): string {
  const candidates = [
    r?.output_text,
    r?.output,
    r?.result?.output_text,
    r?.result?.text,
    r?.messages?.filter?.((m: any) => m?.role === 'assistant')?.at?.(-1)?.content,
    r?.choices?.[0]?.message?.content,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
    if (Array.isArray(c)) {
      const joined = c.map((p: any) => (typeof p === 'string' ? p : p?.text || '')).join('').trim()
      if (joined) return joined
    }
  }
  return ''
}

/** A fresh Hermes session, so a conversation keeps its history. */
export async function newSession(botId: string): Promise<string | null> {
  const bot = await getBot(botId)
  try {
    const r = await $fetch<any>(`${bot.apiBase.replace(/\/$/, '')}/api/sessions`, {
      method: 'POST',
      headers: headers(bot),
      body: { profile: bot.profile },
      timeout: 15_000,
    })
    return r?.session_id || r?.id || null
  } catch {
    // Not every version offers this. Without a session the agent simply
    // starts fresh each time, which is worse but not broken.
    return null
  }
}

/**
 * One blocking question to a bot, for the places where the answer is the whole
 * point and there is a person waiting: the SOUL interview, the operator.
 *
 * Everything conversational goes through `startRun` instead.
 */
export async function ask(
  botId: string, text: string, session: string | null, timeout = 240_000,
): Promise<{ text: string; session: string | null }> {
  const bot = await getBot(botId)
  const r = await $fetch<any>(`${bot.apiBase.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: headers(bot, session),
    body: { model: bot.model || 'hermes-agent', messages: [{ role: 'user', content: text }] },
    timeout,
  })
  if (r?.error) throw createError({ statusCode: 502, statusMessage: r.error.message })
  return {
    text: String(r?.choices?.[0]?.message?.content || '').trim(),
    session: r?.session_id || session || null,
  }
}
