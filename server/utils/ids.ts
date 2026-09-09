import { randomBytes } from 'node:crypto'

/** Kurze, sortierbare Kennung: Zeitanteil vorn, Zufall hinten. */
export function id(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`
}

/** Aus einem Namen einen Kanalnamen machen: klein, ohne Umlautprobleme. */
export function slugify(s: string) {
  return s.toLowerCase().trim()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'kanal'
}
