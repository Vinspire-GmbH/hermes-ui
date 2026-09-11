/**
 * Fill a database with presentable, obviously fictional data.
 *
 * For the README screenshots, and for looking at the interface without
 * wiring up a Hermes instance first. Names and content are invented on
 * purpose: a screenshot otherwise shows somebody's real work.
 *
 * Create the first account through the application before running this — the
 * password hash has a format this script should not try to reproduce:
 *
 *   HERMES_UI_DB=demo.db NUXT_SESSION_PASSWORD=$(openssl rand -base64 32) \
 *     node .output/server/index.mjs &
 *   curl -X POST localhost:3000/api/setup -H 'Content-Type: application/json' \
 *     -d '{"name":"Dana Okoro","email":"dana@example.com","password":"screenshot-only"}'
 *   DB=demo.db node scripts/demo-seed.mjs
 */
import Database from 'better-sqlite3'
import { randomBytes } from 'node:crypto'

const db = new Database(process.env.DB)
const id = p => `${p}_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`
const now = Date.now()
const min = m => now - m * 60_000

// nuxt-auth-utils speichert scrypt als "salt:hash" — hier direkt erzeugt,
// damit der Screenshot ohne Klickstrecke entsteht.
// Dana was created by the application itself, so the password hash has the
// shape nuxt-auth-utils expects — a hand-rolled scrypt hash is rejected.
const me = db.prepare(`SELECT id FROM users WHERE email='dana@example.com'`).get().id
const kollegin = id('u')
db.prepare(`INSERT INTO users (id,email,name,password_hash,role,created_at) VALUES (?,?,?,?,?,?)`)
  .run(kollegin, 'sam@example.com', 'Sam Vermeer',
       db.prepare('SELECT password_hash h FROM users WHERE id=?').get(me).h, 'member', min(8000))

const bots = [
  ['b_scout',  'scout',   'Scout',   'scout-research', '#22d3ee', 'Research and briefings'],
  ['b_ledger', 'ledger',  'Ledger',  'ledger-finance', '#a3e635', 'Invoices and bookkeeping'],
  ['b_forge',  'forge',   'Forge',   'forge-dev',      '#e879f9', 'Repos, builds, deployments'],
]
for (const [bid, slug, name, profile, color, desc] of bots) {
  db.prepare(`INSERT INTO bots (id,slug,name,profile,api_base,api_key,model,color,description,operator,active,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,1,?)`)
    .run(bid, slug, name, profile, 'http://hermes:9200', 'redacted',
         'claude-sonnet-5', color, desc, bid === 'b_forge' ? 1 : 0, min(9000))
}

const channels = [
  ['c_general', 'general',  'general',  'Anything without a channel of its own'],
  ['c_research','research', 'research', 'Briefings and what the numbers say'],
  ['c_finance', 'finance',  'finance',  'Invoices, filed automatically'],
]
db.prepare(`DELETE FROM channels WHERE slug='general'`).run()
for (const [cid, slug, name, topic] of channels) {
  db.prepare(`INSERT INTO channels (id,slug,name,topic,kind,created_by,created_at) VALUES (?,?,?,?,'channel',?,?)`)
    .run(cid, slug, name, topic, me, min(9000))
  db.prepare(`INSERT INTO members (id,channel_id,kind,ref_id,added_at) VALUES (?,?,'user',?,?)`)
    .run(id('m'), cid, me, min(9000))
}
db.prepare(`INSERT INTO members (id,channel_id,kind,ref_id,added_at) VALUES (?,?,'user',?,?)`)
  .run(id('m'), 'c_general', kollegin, min(8000))
for (const [cid, bid] of [['c_research','b_scout'],['c_finance','b_ledger'],['c_general','b_forge'],['c_general','b_scout']]) {
  db.prepare(`INSERT INTO members (id,channel_id,kind,ref_id,added_at) VALUES (?,?,'bot',?,?)`)
    .run(id('m'), cid, bid, min(9000))
}

const bericht = `## Weekly digest — 4–10 September

**Traffic:** 1,284 visitors (+6 % on last week) · 2,051 views · bounce 71 %

Most read:

1. [Self-hosting a workflow engine](https://example.com/blog/self-hosting) — 212 visitors
2. Migrating four sites in an afternoon — 168
3. What a cache read actually costs — 141

| Source | Visitors |
|---|---|
| Direct | 604 |
| Search | 431 |
| Referral | 249 |

> The migration post is climbing for the third week. Worth a follow-up.

Numbers pulled with \`insights trend --days 7\`. Nothing needs a decision.`

const nachrichten = [
  ['c_research', 'user', me,        'Morning @scout — how did last week go?', 'done', min(58), null, null, null],
  ['c_research', 'bot',  'b_scout', bericht, 'done', min(56), null, 128_400, 2_910],
  ['c_research', 'user', me,        'Good. Draft a follow-up on the migration piece?', 'done', min(12), null, null, null],
  ['c_research', 'bot',  'b_scout', '', 'pending', min(11),
    JSON.stringify({ tool: 'web_search', preview: 'workflow engine migration 2026', tools: 3, at: min(11) }), null, null],
]
for (const [cid, kind, author, body, state, at, progress, tin, tout] of nachrichten) {
  db.prepare(`INSERT INTO messages (id,channel_id,thread_root_id,author_kind,author_id,body,state,run_id,approval,progress,input_tokens,output_tokens,created_at)
              VALUES (?,?,NULL,?,?,?,?,?,NULL,?,?,?,?)`)
    .run(id('msg'), cid, kind, author, body, state, state === 'pending' ? 'run_demo' : null, progress, tin, tout, at)
}

// A waiting approval — the screen nobody else shows in a README.
db.prepare(`INSERT INTO messages (id,channel_id,thread_root_id,author_kind,author_id,body,state,run_id,approval,progress,created_at)
            VALUES (?,?,NULL,'user',?,?,'done',NULL,NULL,NULL,?)`)
  .run(id('msg'), 'c_general', me, '@forge can you clear the stale preview deployments?', min(6))
db.prepare(`INSERT INTO messages (id,channel_id,thread_root_id,author_kind,author_id,body,state,run_id,approval,progress,created_at)
            VALUES (?,?,NULL,'bot','b_forge','','approval','run_demo2',?,NULL,?)`)
  .run(id('msg'), 'c_general',
       JSON.stringify({
         command: 'docker container prune --filter "label=preview" --filter "until=168h" --force',
         tool: 'terminal',
         reason: 'Removes containers. Not reversible, so it is worth a look before it runs.',
         choices: ['once','session','always','deny'],
         askedAt: min(6),
       }), min(6))

// Cost rows, plausible and rounded.
const laeufe = [
  ['b_scout','cron','Weekly digest','claude-sonnet-5', 9, 1_100, 4_820_000, 410_000, 41_000, 1.79],
  ['b_scout','cron','Morning briefing','claude-sonnet-5', 28, 3_400, 12_900_000, 1_240_000, 96_000, 5.02],
  ['b_ledger','cron','File invoices','claude-sonnet-5', 30, 900, 3_100_000, 690_000, 24_000, 1.62],
  ['b_forge','cron','Dependency sweep','claude-sonnet-5', 7, 480, 1_450_000, 210_000, 12_000, 0.63],
  ['b_scout','chat',null,'claude-sonnet-5', 41, 1_900, 6_400_000, 520_000, 58_000, 2.44],
  ['b_forge','chat',null,'claude-sonnet-5', 22, 800, 2_050_000, 260_000, 21_000, 0.91],
]
let n = 0
for (const [bid, kind, job, model, runs, calls, cr, cw, out, usd] of laeufe) {
  for (let i = 0; i < runs; i++) {
    db.prepare(`INSERT INTO usage (id,bot_id,kind,ref,source,title,job_id,job_name,model,api_calls,
                  input_tokens,cache_read_tokens,cache_write_tokens,output_tokens,cost_usd,cost_source,at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'estimated', ?)`)
      .run(id('use'), bid, kind, `session:demo${n++}`, kind === 'cron' ? 'cron' : 'api_server',
           job ? `${job} · Sep ${1 + (i % 9)}` : 'Conversation', job ? `job_${bid}` : null, job, model,
           Math.round(calls / runs), 40, Math.round(cr / runs), Math.round(cw / runs),
           Math.round(out / runs), usd / runs, now - (i % 26) * 86_400_000 - 3_600_000)
  }
}
console.log('  seeded:', db.prepare('SELECT count(*) n FROM messages').get().n, 'messages,',
            db.prepare('SELECT count(*) n FROM usage').get().n, 'usage rows')
