import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

let db: ReturnType<typeof drizzle<typeof schema>> | null = null

/**
 * Eine Verbindung für den ganzen Prozess. SQLite verträgt keine zwanzig
 * gleichzeitigen Schreiber, deshalb WAL und ein Wartezeitlimit statt sofortiger
 * „database is locked"-Fehler.
 */
export function useDb() {
  if (db) return db
  const pfad = process.env.HERMES_UI_DB || './.data/hermes-ui.db'
  mkdirSync(dirname(pfad), { recursive: true })
  const sqlite = new Database(pfad)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  tabellenAnlegen(sqlite)
  return db
}

export { schema }

/**
 * Schema beim Start anlegen, falls die Datei neu ist.
 *
 * Bewusst hier und nicht über drizzle-kit-Migrationen: die App soll auf einem
 * frischen Volume ohne Zusatzschritt starten. Sobald es Änderungen am Schema
 * im Betrieb gibt, wandert das auf echte Migrationen um — dann ist `db:push`
 * der Weg, nicht dieses Anlegen.
 */
function tabellenAnlegen(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member',
      created_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      profile TEXT NOT NULL, api_base TEXT NOT NULL, api_key TEXT NOT NULL,
      model TEXT, color TEXT NOT NULL DEFAULT '#4f8a8b', description TEXT,
      active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      topic TEXT, kind TEXT NOT NULL DEFAULT 'channel',
      created_by TEXT NOT NULL, created_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, ref_id TEXT NOT NULL, added_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS members_unique ON members(channel_id, kind, ref_id);
    CREATE INDEX IF NOT EXISTS members_channel ON members(channel_id);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      thread_root_id TEXT, author_kind TEXT NOT NULL, author_id TEXT NOT NULL,
      body TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'done',
      created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_channel_time ON messages(channel_id, created_at);
    CREATE INDEX IF NOT EXISTS messages_thread ON messages(thread_root_id);

    CREATE TABLE IF NOT EXISTS bot_sessions (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      thread_root_id TEXT, hermes_session_id TEXT NOT NULL,
      created_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS bot_session_unique
      ON bot_sessions(bot_id, channel_id, thread_root_id);
  `)
}
