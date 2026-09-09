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

  const key = `${name}:${clientIp(event)}`

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

/**
 * Which address to count against.
 *
 * Behind a reverse proxy the socket address is the proxy, so the real client
 * has to come from `X-Forwarded-For`. The subtlety: that header is a chain,
 * `client, proxy1, proxy2`, and everything except the entry added by the
 * nearest proxy is written by whoever came before — including the client.
 *
 * h3's `getRequestIP` takes the **first** entry. Behind a proxy that appends
 * rather than replaces, that value is attacker-controlled, and a fresh value
 * per request means a fresh bucket per request — the limit would count
 * nothing. Traefik replaces the header, so this installation was never
 * exposed; taking the **last** entry is correct behind either kind of proxy,
 * which matters for an installation that is not this one.
 *
 * `TRUSTED_PROXY_HOPS` shifts that further left for a chain of several
 * proxies you own (a CDN in front of Traefik, say). Left at 1 it means:
 * trust exactly the proxy in front of me.
 */
function clientIp(event: any): string {
  const chain = (getRequestHeader(event, 'x-forwarded-for') || '')
    .split(',').map(s => s.trim()).filter(Boolean)
  if (chain.length) {
    const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS || 1))
    return chain[Math.max(0, chain.length - hops)] || chain[chain.length - 1]
  }
  return event.node?.req?.socket?.remoteAddress || 'unknown'
}
