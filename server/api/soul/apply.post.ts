import { useDb, schema } from '~~/server/db'
import { requireAdmin } from '~~/server/utils/auth'
import { ask } from '~~/server/utils/hermes'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'

/**
 * Create the profile on the Hermes side and write its SOUL.md.
 *
 * The route this takes deserves an explanation, because a more obvious one
 * exists and does not work. Hermes has a dashboard API with `POST
 * /api/profiles` and `PUT /api/profiles/{name}/soul` — exactly the two calls
 * needed. But that dashboard is guarded by an ephemeral session cookie minted
 * at start-up, so nothing outside the dashboard can hold a durable
 * credential for it.
 *
 * What does work is the agent itself: it has a shell, and `hermes` is on its
 * PATH. So an agent explicitly marked as an operator is asked to run the
 * commands. This is deliberate and admin-only: it hands shell work to a bot,
 * and the instruction below is fixed text with substituted values — never a
 * command typed by a user.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{
    profile?: string
    soul?: string
    description?: string
    cloneFrom?: string
    operatorBotId?: string
  }>(event)

  const profile = String(body?.profile || '').trim()
  const soul = String(body?.soul || '').trim()
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(profile)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Profile name: lowercase letters, digits and dashes, 2 to 41 characters',
    })
  }
  if (soul.length < 40) throw createError({ statusCode: 400, statusMessage: 'SOUL is empty' })
  if (soul.includes(HEREDOC)) {
    throw createError({ statusCode: 400, statusMessage: `The SOUL must not contain the line ${HEREDOC}` })
  }

  // `cloneFrom` lands in a command line, so it gets the same treatment as
  // `profile` — a profile name and nothing else. Without this check a string
  // like "default; curl … | sh" turns "administrator of this console" into
  // "shell on the agent host", and those are meant to be different things.
  const cloneFrom = String(body?.cloneFrom || 'default').trim()
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(cloneFrom)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Source profile: lowercase letters, digits and dashes only',
    })
  }

  const db = useDb()
  const operator = body.operatorBotId
    ? (await db.select().from(schema.bots).where(eq(schema.bots.id, body.operatorBotId)).limit(1))[0]
    : (await db.select().from(schema.bots).where(eq(schema.bots.operator, 1)).limit(1))[0]
  if (!operator || !operator.operator) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No operator bot configured. Mark one in the bot settings.',
    })
  }

  // A port for the new profile's api_server: one above the highest already in
  // use, so two profiles never collide.
  const bots = await db.select().from(schema.bots)
  const ports = bots.map(b => Number(new URL(b.apiBase).port || 0)).filter(p => p >= 9200)
  const port = (ports.length ? Math.max(...ports) : 9199) + 1
  const key = `sk-${randomBytes(24).toString('hex')}`

  const instruction = [
    'This is an operating task, not a conversation. Run the following steps in',
    'the shell, in order, and report what happened. Do not improvise extra',
    'steps and do not change any other profile.',
    '',
    `1. Create the profile, cloning an existing one so it inherits a model and`,
    `   credentials (a fresh profile has neither and cannot answer):`,
    '',
    `   HERMES_HOME=/opt/data hermes profile create ${profile} \\`,
    `     --clone-from ${cloneFrom} \\`,
    `     --description ${shellQuote(body.description || profile)}`,
    '',
    '2. Find out where it landed:',
    '',
    `   HERMES_HOME=/opt/data hermes profile show ${profile}`,
    '',
    '   Take the path from the "Path:" line. Everything below uses it as $P.',
    '',
    '3. Write the persona document to $P/SOUL.md, replacing whatever is there.',
    '   Use exactly this, so nothing gets mangled by quoting:',
    '',
    `   cat > $P/SOUL.md <<'${HEREDOC}'`,
    soul,
    HEREDOC,
    '',
    '4. Switch on the api_server platform so a console can reach it:',
    '',
    `   HERMES_HOME=/opt/data hermes -p ${profile} config set platforms.api_server.enabled true`,
    `   HERMES_HOME=/opt/data hermes -p ${profile} config set platforms.api_server.port ${port}`,
    `   HERMES_HOME=/opt/data hermes -p ${profile} config set platforms.api_server.extra.host 0.0.0.0`,
    '',
    `5. Append this line to $P/.env, without disturbing the rest of the file:`,
    '',
    `   API_SERVER_KEY=${key}`,
    '',
    '6. Report, in this order and nothing else: the path from step 2, whether',
    '   SOUL.md now exists and how many lines it has, the output of',
    `   "HERMES_HOME=/opt/data hermes -p ${profile} config get platforms.api_server.port",`,
    '   and whether the API_SERVER_KEY line is present in .env.',
    '',
    'If any step fails, stop there and say which one and why. Do not carry on',
    'past a failure.',
  ].join('\n')

  const reply = await ask(operator.id, instruction, null, 300_000)
  return {
    ok: true,
    profile,
    port,
    apiKey: key,
    operator: operator.slug,
    report: reply.text,
    note: 'The gateway picks up a new platform when the Hermes container restarts. '
      + 'After that, register the bot with this address and key.',
  }
})

const HEREDOC = 'HERMES_SOUL_EOF'

/** Single-quote for a POSIX shell: the only escape that needs care is the quote. */
function shellQuote(s: string) {
  return `'${s.replace(/'/g, `'\\''`)}'`
}
