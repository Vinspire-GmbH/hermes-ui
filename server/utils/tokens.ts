import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { useDb, schema } from '../db'
import { eq } from 'drizzle-orm'

/** Only the hash goes into storage — a stolen backup hands out no keys. */
export function hashToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** A fresh key shaped `hui-<40 hex>`, recognisable by its prefix. */
export function newToken(prefix = 'hui') {
  const token = `${prefix}-${randomBytes(20).toString('hex')}`
  return { token, hash: hashToken(token), prefix: token.slice(0, 12) }
}

/**
 * Find the bot behind a bearer key.
 *
 * The comparison runs over the hash and therefore over an index — its runtime
 * does not depend on the key. `timingSafeEqual` covers the last step against
 * measuring partial matches.
 */
export async function botFromKey(event: any) {
  const header = getHeader(event, 'authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) throw createError({ statusCode: 401, statusMessage: 'No key' })

  const db = useDb()
  const hash = hashToken(token)
  const [row] = await db.select().from(schema.botTokens)
    .where(eq(schema.botTokens.tokenHash, hash)).limit(1)
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(row?.tokenHash || '0'.repeat(64), 'hex')
  if (!row || a.length !== b.length || !timingSafeEqual(a, b)) {
    throw createError({ statusCode: 401, statusMessage: 'Unknown key' })
  }

  const [bot] = await db.select().from(schema.bots).where(eq(schema.bots.id, row.botId)).limit(1)
  if (!bot || !bot.active) throw createError({ statusCode: 403, statusMessage: 'Bot is switched off' })

  await db.update(schema.botTokens).set({ lastUsedAt: Date.now() })
    .where(eq(schema.botTokens.id, row.id))
  return bot
}
