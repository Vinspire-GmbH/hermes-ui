import { randomBytes } from 'node:crypto'

/** Short, sortable identifier: time in front, randomness behind. */
export function id(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`
}

/**
 * Turn a name into a handle: lowercase, no accents, no surprises.
 *
 * German umlauts are transliterated rather than stripped, so "Bücher" becomes
 * `buecher` and not `bcher`.
 */
export function slugify(s: string) {
  return s.toLowerCase().trim()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'channel'
}
