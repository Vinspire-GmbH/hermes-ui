import { requireAdmin } from '~~/server/utils/auth'
import { ask } from '~~/server/utils/hermes'
import { interviewBriefing, extractSoul, generateNow } from '~~/server/utils/soul'

/**
 * One turn of the SOUL interview.
 *
 * State lives in the Hermes session, not here: `session` comes back with every
 * answer and goes out with the next question. So this endpoint stores nothing
 * and a reload of the page loses nothing but the last question on screen.
 *
 * Blocking on purpose — a person is sitting in front of it waiting for the
 * next question, and there is nothing useful to show in the meantime.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{
    architectBotId?: string
    session?: string | null
    answer?: string
    name?: string
    role?: string
    language?: 'en' | 'de'
    finish?: boolean
  }>(event)

  if (!body?.architectBotId) {
    throw createError({ statusCode: 400, statusMessage: 'architectBotId required' })
  }
  const language = body.language === 'de' ? 'de' : 'en'

  let prompt: string
  if (body.finish) {
    prompt = generateNow(language)
  } else if (!body.session) {
    if (!body.name) throw createError({ statusCode: 400, statusMessage: 'name required' })
    prompt = interviewBriefing({ name: body.name, role: body.role, language })
  } else {
    if (!body.answer?.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'answer required' })
    }
    prompt = body.answer.trim()
  }

  const reply = await ask(body.architectBotId, prompt, body.session || null)
  const soul = extractSoul(reply.text)
  return {
    session: reply.session,
    question: soul ? null : reply.text,
    soul,
    done: Boolean(soul),
  }
})
