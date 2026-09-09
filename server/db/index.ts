import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

let db: ReturnType<typeof drizzle<typeof schema>> | null = null

/**
 * One connection for the whole process. SQLite does not take twenty
 * concurrent writers, hence WAL and a busy timeout instead of immediate
 * "database is locked" errors.
 */
export function useDb() {
  if (db) return db
  const path = process.env.HERMES_UI_DB || './.data/hermes-ui.db'
  mkdirSync(dirname(path), { recursive: true })
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  createTables(sqlite)
  return db
}

export { schema }

/**
 * Create the schema at startup if the file is new.
 *
 * Deliberately here rather than through drizzle-kit migrations: the app should
 * start on a fresh volume with no extra step. Column additions go through
 * `addColumn` below, which is cheap and idempotent.
 */
function createTables(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member',
      locale TEXT, created_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, email TEXT,
      role TEXT NOT NULL DEFAULT 'member', invited_by TEXT NOT NULL,
      expires_at INTEGER NOT NULL, accepted_at INTEGER, accepted_by TEXT,
      created_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      profile TEXT NOT NULL, api_base TEXT NOT NULL, api_key TEXT NOT NULL,
      model TEXT, color TEXT NOT NULL DEFAULT '#22d3ee', description TEXT,
      operator INTEGER NOT NULL DEFAULT 0,
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
      run_id TEXT, created_at INTEGER NOT NULL);
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

    CREATE TABLE IF NOT EXISTS bot_tokens (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, label TEXT,
      last_used_at INTEGER, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS bot_tokens_bot ON bot_tokens(bot_id);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
      user_agent TEXT, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS push_user ON push_subscriptions(user_id);
  `)

  // Retro-fit existing databases. ADD COLUMN is cheap and idempotent as long
  // as the "column exists" error is swallowed.
  addColumn(sqlite, 'messages', 'run_id TEXT')
  addColumn(sqlite, 'users', 'locale TEXT')
  addColumn(sqlite, 'bots', 'operator INTEGER NOT NULL DEFAULT 0')
}

function addColumn(sqlite: Database.Database, table: string, definition: string) {
  try {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
  } catch {
    // Already there — the only expected failure.
  }
}
