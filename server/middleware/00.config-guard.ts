import { configProblems } from '../plugins/config-check'

/**
 * Answer honestly while the configuration is incomplete.
 *
 * The companion to the startup message in `server/plugins/config-check.ts`.
 * That one is for whoever reads the log; this one is for whoever is looking
 * at the browser and would otherwise get a bare "Server Error" from deep
 * inside the session layer.
 *
 * A Nitro plugin's `request` hook cannot abort a request — measured, it
 * returned 200 regardless — so the interception belongs here, in middleware,
 * which is the documented seam for it.
 *
 * Evaluated once: the environment does not change while the process runs, and
 * this sits in front of every request.
 */
let fatal: string | null | undefined

export default defineEventHandler((event) => {
  if (fatal === undefined) {
    const blocking = configProblems().find(p => p.variable === 'NUXT_SESSION_PASSWORD')
    fatal = blocking
      ? 'NUXT_SESSION_PASSWORD is not set on the server, so nobody can sign in. '
        + 'Generate one with `openssl rand -base64 32`, set it, and restart.'
      : null
  }
  if (!fatal) return

  // Only the API. A page that renders is still useful — it shows the sign-in
  // form, and the form's request then carries the explanation.
  if (!event.path.startsWith('/api/')) return
  throw createError({ statusCode: 503, statusMessage: fatal })
})
