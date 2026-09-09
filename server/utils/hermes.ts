import { useDb, schema } from '../db'
import { eq } from 'drizzle-orm'

export interface HermesAntwort {
  text: string
  sitzung: string | null
  verbrauch?: { prompt_tokens?: number; completion_tokens?: number }
}

/**
 * Ruft einen Hermes-Agenten über die api_server-Plattform seines Profils.
 *
 * Die Schnittstelle ist OpenAI-kompatibel; die Sitzungskontinuität hängt an
 * der Kopfzeile `X-Hermes-Session-Id`. Ohne sie beginnt der Agent bei jeder
 * Nachricht ohne Verlauf — für ein Gespräch also unbrauchbar.
 *
 * Zeitlimit großzügig: ein Lauf mit Werkzeugen (Postfach lesen, Datei ablegen)
 * dauert gemessen bis zu zwei Minuten.
 */
export async function frageBot(
  botId: string,
  text: string,
  sitzung: string | null,
): Promise<HermesAntwort> {
  const db = useDb()
  const [bot] = await db.select().from(schema.bots).where(eq(schema.bots.id, botId)).limit(1)
  if (!bot) throw createError({ statusCode: 404, statusMessage: 'Bot unbekannt' })

  const kopf: Record<string, string> = {
    'Authorization': `Bearer ${bot.apiKey}`,
    'Content-Type': 'application/json',
  }
  if (sitzung) kopf['X-Hermes-Session-Id'] = sitzung

  const antwort = await $fetch<any>(`${bot.apiBase.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: kopf,
    body: { model: bot.model || 'hermes-agent', messages: [{ role: 'user', content: text }] },
    timeout: 180_000,
  })

  if (antwort?.error) {
    throw createError({ statusCode: 502, statusMessage: antwort.error.message || 'Hermes-Fehler' })
  }

  return {
    text: antwort?.choices?.[0]?.message?.content ?? '',
    // Hermes gibt die Sitzung entweder direkt oder als `id` der Antwort zurück.
    sitzung: antwort?.session_id ?? antwort?.id ?? sitzung ?? null,
    verbrauch: antwort?.usage,
  }
}

/** Legt eine Hermes-Sitzung an, damit ein Gesprächsstrang seinen Verlauf behält. */
export async function neueSitzung(botId: string): Promise<string | null> {
  const db = useDb()
  const [bot] = await db.select().from(schema.bots).where(eq(schema.bots.id, botId)).limit(1)
  if (!bot) return null
  try {
    const r = await $fetch<any>(`${bot.apiBase.replace(/\/$/, '')}/api/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bot.apiKey}`, 'Content-Type': 'application/json' },
      body: {},
      timeout: 20_000,
    })
    return r?.session?.id ?? null
  } catch {
    // Kein Beinbruch: ohne Sitzung antwortet der Agent trotzdem, nur ohne Verlauf.
    return null
  }
}
