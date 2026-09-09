import { useDb, schema } from '../db'
import { eq } from 'drizzle-orm'

async function botHolen(botId: string) {
  const db = useDb()
  const [bot] = await db.select().from(schema.bots).where(eq(schema.bots.id, botId)).limit(1)
  if (!bot) throw createError({ statusCode: 404, statusMessage: 'Bot unbekannt' })
  return bot
}

function kopf(bot: any, sitzung?: string | null) {
  const k: Record<string, string> = {
    Authorization: `Bearer ${bot.apiKey}`,
    'Content-Type': 'application/json',
  }
  if (sitzung) k['X-Hermes-Session-Id'] = sitzung
  return k
}

/**
 * Startet einen Agentenlauf und gibt sofort dessen Kennung zurück.
 *
 * Der Umweg über `/v1/runs` statt `/v1/chat/completions` ist der Kern: ein
 * Agent, der arbeitet, braucht Minuten. Gemessen an Bob, der auf eine Frage
 * eine Firecrawl-Recherche startete — nach drei Minuten lief er noch. Ein
 * blockierender Aufruf läuft dabei zwangsläufig in ein Zeitlimit, egal wie
 * großzügig es gesetzt ist. `/v1/runs` antwortet in Millisekunden mit einer
 * Kennung; das Ergebnis wird danach abgefragt.
 */
export async function laufStarten(
  botId: string, text: string, sitzung: string | null,
): Promise<string> {
  const bot = await botHolen(botId)
  const r = await $fetch<any>(`${bot.apiBase.replace(/\/$/, '')}/v1/runs`, {
    method: 'POST',
    headers: kopf(bot, sitzung),
    body: { model: bot.model || 'hermes-agent', input: text },
    timeout: 30_000,
  })
  if (r?.error) throw createError({ statusCode: 502, statusMessage: r.error.message })
  if (!r?.run_id) throw createError({ statusCode: 502, statusMessage: 'Hermes gab keine Laufkennung' })
  return r.run_id
}

export interface LaufStand {
  status: string
  fertig: boolean
  text: string
  sitzung: string | null
}

/** Fragt den Stand eines Laufs ab. Kurzes Zeitlimit — das ist eine Statusabfrage. */
export async function laufAbfragen(botId: string, runId: string): Promise<LaufStand> {
  const bot = await botHolen(botId)
  const r = await $fetch<any>(`${bot.apiBase.replace(/\/$/, '')}/v1/runs/${runId}`, {
    headers: kopf(bot),
    timeout: 20_000,
  })
  const status = String(r?.status ?? 'unbekannt')
  return {
    status,
    // Alles außer „läuft noch" gilt als abgeschlossen — auch Fehlerzustände,
    // damit eine Nachricht nicht für immer auf „denkt nach" stehen bleibt.
    fertig: !['started', 'running', 'queued', 'pending'].includes(status),
    text: r?.output ?? '',
    sitzung: r?.session_id ?? null,
  }
}

/** Legt eine Hermes-Sitzung an, damit ein Gesprächsstrang seinen Verlauf behält. */
export async function neueSitzung(botId: string): Promise<string | null> {
  const bot = await botHolen(botId)
  try {
    const r = await $fetch<any>(`${bot.apiBase.replace(/\/$/, '')}/api/sessions`, {
      method: 'POST', headers: kopf(bot), body: {}, timeout: 20_000,
    })
    return r?.session?.id ?? null
  } catch {
    // Kein Beinbruch: ohne Sitzung antwortet der Agent, nur ohne Verlauf.
    return null
  }
}
