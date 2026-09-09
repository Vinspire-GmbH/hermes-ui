import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core'

/**
 * People. Passwords are stored as scrypt hashes from nuxt-auth-utils, never
 * in the clear.
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
  locale: text('locale', { enum: ['en', 'de'] }),
  createdAt: integer('created_at').notNull(),
})

/**
 * An invitation to join. Only the token's SHA-256 is stored, so a leaked
 * backup hands out no working links.
 */
export const invites = sqliteTable('invites', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  email: text('email'),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
  invitedBy: text('invited_by').notNull(),
  expiresAt: integer('expires_at').notNull(),
  acceptedAt: integer('accepted_at'),
  acceptedBy: text('accepted_by'),
  createdAt: integer('created_at').notNull(),
})

/**
 * A bot is a Hermes profile, reachable through that profile's api_server
 * platform.
 *
 * `apiBase` and `apiKey` stay server-side — the browser never sees them. One
 * profile can carry several bots, so `profile` is not a key.
 */
export const bots = sqliteTable('bots', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  profile: text('profile').notNull(),
  apiBase: text('api_base').notNull(),
  apiKey: text('api_key').notNull(),
  model: text('model'),
  color: text('color').notNull().default('#22d3ee'),
  description: text('description'),
  // A bot that may run shell commands on its host. Used to create Hermes
  // profiles and write SOUL.md from here; see server/utils/operator.ts.
  operator: integer('operator').notNull().default(0),
  active: integer('active').notNull().default(1),
  createdAt: integer('created_at').notNull(),
})

/**
 * Channels and direct messages share one table: a DM is a channel with
 * `kind = 'dm'` and exactly two members. That saves a second message table
 * and with it half of all special cases.
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
 * Membership, for people and bots alike. In a channel a bot answers only when
 * it is a member and gets mentioned — exactly like Slack.
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
 * Messages. `threadRootId` is null for posts in the channel itself and
 * otherwise points at the message the thread hangs under.
 */
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  threadRootId: text('thread_root_id'),
  authorKind: text('author_kind', { enum: ['user', 'bot', 'system'] }).notNull(),
  authorId: text('author_id').notNull(),
  body: text('body').notNull(),
  // While the agent is working this reads 'pending'; on failure 'error'.
  // 'approval' means the run has stopped and is waiting for a person to allow
  // or refuse a command — not an end state, and not a failure.
  state: text('state', { enum: ['done', 'pending', 'error', 'approval'] })
    .notNull().default('done'),
  // The pending approval as JSON: the command, the tool, the choices offered.
  // Fetched once, when the run enters the waiting state.
  approval: text('approval'),
  // Identifier of the Hermes run while it is open. Kept in the row so the
  // state survives a restart of this application.
  runId: text('run_id'),
  createdAt: integer('created_at').notNull(),
}, (t) => [
  index('messages_channel_time').on(t.channelId, t.createdAt),
  index('messages_thread').on(t.threadRootId),
])

/**
 * The bridge to Hermes: one session per bot and conversation strand, so the
 * agent knows the history. Without it every message would start from nothing.
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

/**
 * The write key a bot uses to post into a channel from outside — the
 * counterpart to Slack's bot token. This is how a cron run reports without
 * anyone having started the conversation.
 *
 * Only the key's SHA-256 is stored; the plaintext exists once, in the response
 * that creates it. `prefix` exists only so a key can be recognised in a list.
 */
export const botTokens = sqliteTable('bot_tokens', {
  id: text('id').primaryKey(),
  botId: text('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  label: text('label'),
  lastUsedAt: integer('last_used_at'),
  createdAt: integer('created_at').notNull(),
}, (t) => [
  index('bot_tokens_bot').on(t.botId),
])

/**
 * One Web Push endpoint per browser a person uses. A subscription dies when
 * the browser discards it, so `failedAt` marks endpoints the push service has
 * rejected as gone; they are deleted rather than retried forever.
 */
export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: integer('created_at').notNull(),
}, (t) => [
  index('push_user').on(t.userId),
])
