import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { useDb, schema } from '../db'
import { eq } from 'drizzle-orm'

/** Nur der Hash liegt in der Ablage — ein gestohlenes Backup gibt keine Schlüssel her. */
export function hashen(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Neuer Schlüssel im Format `hui-<40 hex>`, wiedererkennbar am Vorspann. */
export function schluesselErzeugen() {
  const roh = randomBytes(20).toString('hex')
  const token = `hui-${roh}`
  return { token, hash: hashen(token), prefix: token.slice(0, 12) }
}

/**
 * Den Bot hinter einem Bearer-Schlüssel finden.
 *
 * Der Vergleich läuft über den Hash und damit über einen Index — laufzeit-
 * unabhängig vom Schlüssel selbst. `timingSafeEqual` sichert den letzten
 * Schritt gegen das Ausmessen von Teiltreffern ab.
 */
export async function botAusSchluessel(event: any) {
  const kopf = getHeader(event, 'authorization') || ''
  const token = kopf.replace(/^Bearer\s+/i, '').trim()
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Kein Schlüssel' })

  const db = useDb()
  const hash = hashen(token)
  const [zeile] = await db.select().from(schema.botTokens)
    .where(eq(schema.botTokens.tokenHash, hash)).limit(1)
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(zeile?.tokenHash || '0'.repeat(64), 'hex')
  if (!zeile || a.length !== b.length || !timingSafeEqual(a, b)) {
    throw createError({ statusCode: 401, statusMessage: 'Schlüssel unbekannt' })
  }

  const [bot] = await db.select().from(schema.bots).where(eq(schema.bots.id, zeile.botId)).limit(1)
  if (!bot || !bot.active) throw createError({ statusCode: 403, statusMessage: 'Bot abgeschaltet' })

  await db.update(schema.botTokens).set({ lastUsedAt: Date.now() })
    .where(eq(schema.botTokens.id, zeile.id))
  return bot
}
