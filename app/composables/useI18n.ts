import en from '~/i18n/en'
import de from '~/i18n/de'

export const LOCALES = { en, de } as const
export type Locale = keyof typeof LOCALES
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', de: 'Deutsch' }

/**
 * A small translation layer instead of a module.
 *
 * Two locales, flat dotted keys, one cookie. That is the whole requirement,
 * and it buys independence from a module's compatibility with each Nuxt
 * release — the kind of dependency that breaks on an upgrade you did for
 * another reason entirely.
 *
 * The order of preference: what the person chose (cookie, and on their account
 * once signed in), then what the browser asks for, then English.
 */
export function useI18n() {
  const cookie = useCookie<Locale>('locale', {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    path: '/',
  })
  const locale = useState<Locale>('locale', () => cookie.value || detect())

  function detect(): Locale {
    const header = useRequestHeaders(['accept-language'])['accept-language'] || ''
    const fromBrowser = import.meta.client ? navigator.languages?.join(',') || navigator.language : header
    return /\bde\b/i.test(fromBrowser || '') ? 'de' : 'en'
  }

  function setLocale(next: Locale) {
    locale.value = next
    cookie.value = next
    if (import.meta.client) {
      document.documentElement.lang = next
      // Remember it on the account too, so a new browser starts right.
      $fetch('/api/me/locale', { method: 'POST', body: { locale: next } }).catch(() => {})
    }
  }

  /**
   * `t('chat.placeholder', { channel: 'general' })`
   *
   * A missing key returns the key itself rather than an empty string: a
   * visible `chat.sned` in the interface gets fixed, an empty space does not.
   */
  function t(key: string, vars?: Record<string, string | number>): string {
    const raw = lookup(LOCALES[locale.value], key) ?? lookup(LOCALES.en, key) ?? key
    if (!vars) return raw
    return raw.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`))
  }

  return { locale, setLocale, t, locales: LOCALE_NAMES }
}

function lookup(tree: unknown, key: string): string | undefined {
  let node: any = tree
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}
