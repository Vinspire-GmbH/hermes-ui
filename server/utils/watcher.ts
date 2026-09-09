import { useDb, schema } from '../db'
import { eq } from 'drizzle-orm'
import { notifyChannel, preview } from './push'

/**
 * Follow one run's event stream and write what it says into the message row.
 *
 * Why a watcher rather than polling for this: the pollable status carries only
 * a state name. Which tool is running, and what command an approval is asking
 * about, exist solely as events. And the stream tolerates exactly one reader,
 * so this is also the arbiter — while it holds the stream nothing else reads it.
 *
 * Deliberately fire-and-forget and deliberately not the source of truth. If
 * this process restarts, the watcher is gone and the run keeps going; the
 * polling reconciliation in `messages.get` still finishes the message from the
 * status endpoint. What is lost in that case is the progress detail, not the
 * answer.
 */
const watched = new Set<string>()

export function watching(runId: string) {
  return watched.has(runId)
}

export function watchRun(opts: {
  runId: string
  messageId: string
  channelId: string
  botId: string
  apiBase: string
  apiKey: string
  botName: string
}) {
  if (watched.has(opts.runId)) return
  watched.add(opts.runId)
  // Not awaited: the caller is answering an HTTP request.
  void follow(opts).finally(() => watched.delete(opts.runId))
}

async function follow(opts: {
  runId: string
  messageId: string
  channelId: string
  botId: string
  apiBase: string
  apiKey: string
  botName: string
}) {
  const db = useDb()
  const url = `${opts.apiBase.replace(/\/$/, '')}/v1/runs/${opts.runId}/events`

  // A hard ceiling so a run that never terminates cannot leave a reader
  // hanging for the life of the process. Two hours is far beyond any real
  // agent turn; past that the polling path takes over.
  const stop = new AbortController()
  const ceiling = setTimeout(() => stop.abort(), 2 * 60 * 60 * 1000)

  let tools = 0
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      signal: stop.signal,
    })
    if (!response.ok || !response.body) return

    for await (const event of frames(response.body, stop.signal)) {
      switch (event.event) {
        case 'tool.started': {
          tools++
          await db.update(schema.messages).set({
            progress: JSON.stringify({
              tool: event.tool || null,
              preview: typeof event.preview === 'string' ? event.preview.slice(0, 160) : null,
              tools,
              at: Date.now(),
            }),
          }).where(eq(schema.messages.id, opts.messageId))
          break
        }

        case 'approval.request': {
          const pending = {
            command: event.command || undefined,
            tool: event.tool || event.tool_name || undefined,
            reason: event.description || event.reason || undefined,
            choices: Array.isArray(event.choices) && event.choices.length
              ? event.choices
              : ['once', 'session', 'always', 'deny'],
            askedAt: Date.now(),
          }
          await db.update(schema.messages).set({
            state: 'approval', approval: JSON.stringify(pending), progress: null,
          }).where(eq(schema.messages.id, opts.messageId))
          // Worth its own notification: an approval expires after five minutes.
          notifyChannel(opts.channelId, {
            title: `${opts.botName} needs permission`,
            body: preview(pending.command || 'A command is waiting for approval.'),
            url: `/c/${opts.channelId}`,
            tag: `${opts.channelId}-approval`,
          }).catch(() => {})
          break
        }

        case 'approval.responded': {
          await db.update(schema.messages)
            .set({ state: 'pending', approval: null })
            .where(eq(schema.messages.id, opts.messageId))
          break
        }

        case 'run.completed': {
          // The answer itself is still written by the reconciliation pass, so
          // there is one place that decides what a finished message looks
          // like. What only the event carries is the token count.
          await recordContextSize(opts, event.usage || {})
          return
        }

        case 'run.failed':
        case 'run.cancelled':
          return
      }
    }
  } catch {
    // A dropped stream is not an error worth surfacing: the run continues and
    // the polling path still finishes the message.
  } finally {
    clearTimeout(ceiling)
    stop.abort()
  }
}

/**
 * Note the size of the context this answer carried.
 *
 * Not a cost, and no longer written to the usage table. The api_server
 * reports `usage.input_tokens` as `session_prompt_tokens`, which is
 * `input + cache_read + cache_write` — a context size, not fresh input.
 * Pricing it produced a bill five times too high. The money now comes from
 * one place only: Hermes' own accounting, shipped by `chat usage`.
 *
 * The number stays on the message because it is genuinely useful there —
 * it shows how much context a turn dragged along — but the interface labels
 * it as context, not as spend.
 */
async function recordContextSize(
  opts: { messageId: string },
  usage: Record<string, any>,
) {
  const input = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0)
  const output = Number(usage.output_tokens ?? usage.completion_tokens ?? 0)
  if (!input && !output) return
  await useDb().update(schema.messages)
    .set({ inputTokens: input, outputTokens: output })
    .where(eq(schema.messages.id, opts.messageId))
}

/** Turn a byte stream of SSE frames into parsed events. */
async function* frames(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (!signal.aborted) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const part of parts) {
      const data = part.split('\n')
        .filter(l => l.startsWith('data:'))
        .map(l => l.slice(5).trim())
        .join('')
      if (!data) continue
      try {
        yield JSON.parse(data)
      } catch {
        // Keepalive comment or a frame shape we do not know.
      }
    }
  }
}
