import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core'

/**
 * Menschen. Passwörter liegen als scrypt-Hash von nuxt-auth-utils vor,
 * niemals im Klartext.
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
  createdAt: integer('created_at').notNull(),
})

/**
 * Ein Bot ist ein Hermes-Profil, erreichbar über dessen api_server-Plattform.
 *
 * `apiBase` und `apiKey` bleiben serverseitig — der Browser sieht sie nie.
 * Ein Profil kann mehrere Bots tragen, deshalb ist `profile` kein Schlüssel.
 */
export const bots = sqliteTable('bots', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  profile: text('profile').notNull(),
  apiBase: text('api_base').notNull(),
  apiKey: text('api_key').notNull(),
  model: text('model'),
  color: text('color').notNull().default('#4f8a8b'),
  description: text('description'),
  active: integer('active').notNull().default(1),
  createdAt: integer('created_at').notNull(),
})

/**
 * Kanäle und Direktnachrichten liegen in derselben Tabelle: eine DM ist ein
 * Kanal mit `kind = 'dm'` und genau zwei Mitgliedern. Das erspart eine zweite
 * Nachrichtentabelle und damit die Hälfte aller Sonderfälle.
 */
export const channels = sqliteTable('channels', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  topic: text('topic'),
  kind: text('kind', { enum: ['channel', 'dm'] }).notNull().default('channel'),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
})

/**
 * Mitgliedschaft, für Menschen und Bots gleichermaßen. Ein Bot antwortet in
 * einem Kanal nur, wenn er Mitglied ist und erwähnt wird — genau wie in Slack.
 */
export const members = sqliteTable('members', {
  id: text('id').primaryKey(),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['user', 'bot'] }).notNull(),
  refId: text('ref_id').notNull(),
  addedAt: integer('added_at').notNull(),
}, (t) => [
  unique('members_unique').on(t.channelId, t.kind, t.refId),
  index('members_channel').on(t.channelId),
])

/**
 * Nachrichten. `threadRootId` ist null für Beiträge im Kanal selbst und zeigt
 * sonst auf die Nachricht, unter der der Faden hängt.
 */
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  threadRootId: text('thread_root_id'),
  authorKind: text('author_kind', { enum: ['user', 'bot', 'system'] }).notNull(),
  authorId: text('author_id').notNull(),
  body: text('body').notNull(),
  // Läuft der Agent noch, steht hier 'pending'; bei einem Fehler 'error'.
  state: text('state', { enum: ['done', 'pending', 'error'] }).notNull().default('done'),
  createdAt: integer('created_at').notNull(),
}, (t) => [
  index('messages_channel_time').on(t.channelId, t.createdAt),
  index('messages_thread').on(t.threadRootId),
])

/**
 * Die Brücke zu Hermes: je Bot und Gesprächsstrang eine Sitzung, damit der
 * Agent den Verlauf kennt. Ohne das beginnt jede Nachricht bei null.
 */
export const botSessions = sqliteTable('bot_sessions', {
  id: text('id').primaryKey(),
  botId: text('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  threadRootId: text('thread_root_id'),
  hermesSessionId: text('hermes_session_id').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [
  unique('bot_session_unique').on(t.botId, t.channelId, t.threadRootId),
])
