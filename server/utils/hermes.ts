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
  waitingForApproval: boolean
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

  // `waiting_for_approval` is emphatically **not** finished. It used to be in
  // this list, which turned "the agent needs permission to run a command" into
  // "Run ended with status: waiting_for_approval" in the channel — a dead end
  // where there was in fact a question waiting for an answer.
  const finished = ['completed', 'succeeded', 'failed', 'cancelled', 'error'].includes(status)
  return {
    status,
    finished,
    waitingForApproval: status === 'waiting_for_approval',
    text: extractText(r),
    session: r?.session_id || null,
  }
}

export interface PendingApproval {
  command?: string
  tool?: string
  reason?: string
  choices: string[]
  askedAt: number
}

/**
 * What exactly is being approved.
 *
 * The pollable status says only `waiting_for_approval`; the detail — the
 * command, and which answers are on offer — travels on the run's event stream.
 * So this connects to it, takes the buffered `approval.request`, and hangs up.
 *
 * Call it **once** per waiting run. The stream handler on the Hermes side
 * discards the run's event queue when a subscriber disconnects, so a second
 * read would come back empty; that is why the caller stores the result instead
 * of fetching it on every poll. Approving still works either way — that goes
 * through the approval endpoint, not the stream.
 *
 * Hermes redacts credentials out of the command before it reaches this stream.
 */
export async function fetchApproval(
  botId: string, runId: string,
): Promise<PendingApproval | null> {
  const bot = await getBot(botId)
  const url = `${bot.apiBase.replace(/\/$/, '')}/v1/runs/${runId}/events`

  const stop = new AbortController()
  // The stream stays open by design and sends a keepalive every 30 seconds.
  // Buffered events arrive at once, so a few seconds is plenty — and this must
  // not become a long-lived connection inside a request handler.
  const timer = setTimeout(() => stop.abort(), 4000)
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${bot.apiKey}` },
      signal: stop.signal,
    })
    if (!response.ok || !response.body) return null

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let found: PendingApproval | null = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE frames are separated by a blank line. Keep the trailing partial.
      const frames = buffer.split('\n\n')
      buffer = frames.pop() || ''
      for (const frame of frames) {
        const data = frame.split('\n')
          .filter(l => l.startsWith('data:'))
          .map(l => l.slice(5).trim())
          .join('')
        if (!data) continue
        try {
          const event = JSON.parse(data)
          if (event?.event === 'approval.request') {
            found = {
              command: event.command || undefined,
              tool: event.tool || event.tool_name || undefined,
              reason: event.reason || event.explanation || undefined,
              choices: Array.isArray(event.choices) && event.choices.length
                ? event.choices
                : ['once', 'session', 'always', 'deny'],
              askedAt: Date.now(),
            }
          }
        } catch {
          // A keepalive comment or a frame we do not know. Skip it.
        }
      }
      // The buffered backlog is in; anything further would be a wait.
      if (found) break
    }
    return found
  } catch {
    // No detail available. The caller still shows the buttons — approving
    // without knowing the command is bad, but so is a run stuck forever.
    return null
  } finally {
    clearTimeout(timer)
    stop.abort()
  }
}

/**
 * Answer a pending approval.
 *
 * `once` allows this one command, `session` the rest of this conversation,
 * `always` writes it to the profile's permanent allowlist, `deny` refuses.
 */
export async function resolveApproval(
  botId: string, runId: string, choice: 'once' | 'session' | 'always' | 'deny',
): Promise<void> {
  const bot = await getBot(botId)
  await $fetch(`${bot.apiBase.replace(/\/$/, '')}/v1/runs/${runId}/approval`, {
    method: 'POST',
    headers: headers(bot),
    body: { choice },
    timeout: 20_000,
  })
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
