/**
 * A small counter per address and route.
 *
 * In memory, on purpose: this application is one process on one SQLite file,
 * so a shared store would be infrastructure without a matching problem. The
 * honest limits of that choice are worth writing down — the counters reset on
 * restart, and behind several instances each would count for itself. If this
 * ever runs more than once, this belongs in the database.
 *
 * What it is for: guessing. Passwords and invitation tokens are the two
 * things an outsider can try repeatedly, and unlimited attempts turn a
 * 20-byte token from "impossible" into "a matter of patience".
 */
interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()
let lastSweep = Date.now()

/**
 * Allow `limit` attempts per `windowMs`, then answer 429 with `Retry-After`.
 *
 * The window does not slide: after it passes, the count starts over. That is
 * coarser than a sliding window and enough for this — the point is to make a
 * million guesses take years, not to meter traffic precisely.
 */
export function rateLimit(
  event: any, name: string, limit: number, windowMs: number,
) {
  const now = Date.now()

  // Sweep occasionally so a long-running process does not keep a bucket for
  // every address that ever knocked.
  if (now - lastSweep > 10 * 60 * 1000) {
    for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k)
    lastSweep = now
  }

  // Behind a reverse proxy the socket address is the proxy. Traefik sets
  // X-Forwarded-For, and `getRequestIP` reads it when asked — without the
  // flag every visitor would share one bucket.
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const key = `${name}:${ip}`

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }
  bucket.count++
  if (bucket.count > limit) {
    const seconds = Math.ceil((bucket.resetAt - now) / 1000)
    setHeader(event, 'Retry-After', String(seconds))
    throw createError({
      statusCode: 429,
      statusMessage: `Too many attempts. Try again in ${seconds} seconds.`,
    })
  }
}
