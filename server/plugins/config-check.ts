/**
 * Refuse to pretend, when the configuration is incomplete.
 *
 * Without `NUXT_SESSION_PASSWORD` the session layer cannot seal a cookie, and
 * the application answers the first sign-up with a bare "Server Error" — the
 * real cause visible only in the server log, which is exactly where a person
 * setting this up for the first time is not looking. Measured: creating the
 * first account returns 500 and no cookie.
 *
 * So the check happens at startup and says what to do. It does not exit the
 * process: a container that exits restarts, and a restart loop buries the one
 * message worth reading. Instead every API route answers 503 with the same
 * sentence until the variable is set.
 */
const MIN_LENGTH = 32

interface Problem {
  variable: string
  detail: string
  fix: string
}

export function configProblems(): Problem[] {
  const problems: Problem[] = []
  const password = process.env.NUXT_SESSION_PASSWORD || ''

  if (!password) {
    problems.push({
      variable: 'NUXT_SESSION_PASSWORD',
      detail: 'not set — sessions cannot be sealed, so nobody can sign in',
      fix: 'openssl rand -base64 32',
    })
  } else if (password.length < MIN_LENGTH) {
    problems.push({
      variable: 'NUXT_SESSION_PASSWORD',
      detail: `${password.length} characters, at least ${MIN_LENGTH} are needed`,
      fix: 'openssl rand -base64 32',
    })
  }

  // Push is optional by design: without keys the feature stays off rather
  // than failing, so a missing pair is not a problem. A half-set pair is —
  // it looks configured and is not.
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (Boolean(pub) !== Boolean(priv)) {
    problems.push({
      variable: pub ? 'VAPID_PRIVATE_KEY' : 'VAPID_PUBLIC_KEY',
      detail: 'only one half of the Web Push key pair is set, so notifications stay off',
      fix: 'npx web-push generate-vapid-keys',
    })
  }

  return problems
}

export default defineNitroPlugin(() => {
  const problems = configProblems()
  if (!problems.length) return

  const fatal = problems.some(p => p.variable === 'NUXT_SESSION_PASSWORD')
  const line = '─'.repeat(68)
  console.error(`\n${line}`)
  console.error(fatal
    ? '  Hermes Console cannot serve requests: configuration incomplete'
    : '  Hermes Console: configuration warning')
  console.error(line)
  for (const p of problems) {
    console.error(`  ${p.variable}`)
    console.error(`    ${p.detail}`)
    console.error(`    generate one with:  ${p.fix}`)
  }
  console.error(`${line}\n`)

  // The 503 for the browser lives in server/middleware/00.config-guard.ts:
  // a plugin's `request` hook cannot abort a request — measured, it returned
  // 200 regardless.
})
