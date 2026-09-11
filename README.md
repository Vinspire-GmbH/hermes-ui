# Hermes Console

A self-hosted chat console for [Hermes](https://github.com/NousResearch/hermes-agent)
agents. Channels, direct messages, threads, human accounts — and the agents
sitting in the channels with them, answering when mentioned and reporting on
their own when a scheduled run finishes.

It exists because driving a fleet of agents through Slack means every change is
an app manifest, every bot is an OAuth dance, and the schedule lives somewhere
you cannot see. This talks to each agent's `api_server` platform directly.

```
┌────────────────┐   POST /v1/runs                ┌──────────────┐
│  this console  │ ─────────────────────────────▶  │    Hermes    │
│    (Nuxt 4)    │                                 │   profiles   │
│                │ ◀───────────────────────────── │              │
└────────────────┘   POST /api/bot/messages        └──────────────┘
                     (cron reports, `chat` tool)
```

## What it does

- **Channels and DMs.** A bot answers in a channel only when mentioned with
  `@handle`; in a direct message it is always the one being addressed.
- **Long runs, handled honestly.** An agent turn takes minutes. Runs are
  started, not awaited, and reconciled from the database — so a restart of
  this application loses nothing in flight. While a run works, the channel
  shows which tool it is using, and a button to call it off.
- **Approvals.** When an agent needs permission for a command, the channel
  shows the command and four answers: once, this conversation, always, refuse.
  Without this the run simply stops and nobody knows why.
- **Cron reports.** Hermes can only deliver to its own platforms, and this is
  not one of them. A bot key plus the bundled `chat` tool lets a scheduled run
  post its report into a channel.
- **Schedule.** Every profile's cron jobs, sorted by next run across all of
  them, with the last result and the full instruction.
- **Cost.** What the agents spent, per agent and per job, with the four token
  buckets beside the money. The figures are Hermes' own.
- **Bots, created here.** A wizard for the connection and identity, with an
  optional interview that writes the new agent's `SOUL.md` — conducted by a
  bot you already have.
- **Invitations, two languages, notifications.** Link invitations for
  colleagues, English and German, Web Push, installable as a PWA.

## Requirements

- A Hermes installation with the `api_server` platform enabled per profile
- Node 22.19 or newer — Nuxt 4's range is `^22.19.0 || ^24.11.0 || >=26`.
  `.node-version` pins the 22 line for builders that read it: railpack's
  runtime image has no `libatomic.so.1`, and the Node 26 build needs it.
- Nothing else. Storage is SQLite in a file.

## Run it

```bash
cp .env.example .env
echo "NUXT_SESSION_PASSWORD=$(openssl rand -base64 32)" >> .env
npm install
npm run dev               # http://localhost:3000
```

`NUXT_SESSION_PASSWORD` is the one variable that is not optional: without it
the session layer cannot seal a cookie and nobody can sign in. The application
says so at startup and answers 503 rather than failing halfway through a
request.

The first visit asks for a name, an email and a password, and creates the
first administrator. There is no default account and no initial password in an
environment variable.

For production:

```bash
npm run build
npm start
```

### Environment

| Variable | Required | Meaning |
|---|---|---|
| `NUXT_SESSION_PASSWORD` | **yes** | Seals the session cookies. At least 32 characters — `openssl rand -base64 32`. Changing it signs everyone out. |
| `HERMES_UI_DB` | no | Path to the SQLite file. Default `./.data/hermes-ui.db`. Put it on a volume. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | no | Web Push. Without them notifications stay off rather than failing. `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | no | Contact address for the push service, e.g. `mailto:you@example.com`. |
| `MODEL_PRICES` | no | Token prices for models this build does not know, as JSON. Only a fallback — costs normally come from Hermes. |
| `TRUSTED_PROXY_HOPS` | no | How many proxies in front of the app you own. Decides which `X-Forwarded-For` entry the rate limiter counts. Default 1. |

### Connecting an agent

`api_server` needs three settings and a key per profile:

```bash
hermes -p <profile> config set platforms.api_server.enabled true
hermes -p <profile> config set platforms.api_server.port 9200
hermes -p <profile> config set platforms.api_server.extra.host 0.0.0.0
# plus API_SERVER_KEY=… in that profile's .env
```

Then **Admin → Bots → New bot**. The model id is the profile name; only the
root profile is called `hermes-agent`.

`api_server` speaks plain HTTP with a bearer key and has no TLS of its own, so
do not put its port on the open internet — same Docker network, a reverse
proxy with a certificate, or a tunnel.

**[CONNECTING.md](CONNECTING.md) is the long version**: reachability, write
keys, wiring cron reports, shipping cost records, the checklist, and the
limits.

## How it is built

Nuxt 4, Tailwind 4, Drizzle over `better-sqlite3`, `nuxt-auth-utils` for
sessions. No i18n module — two locales, flat keys and a cookie in
`app/composables/useI18n.ts`. No Markdown library either: `app/utils/markdown.ts`
renders the subset agents actually write, escaping every character of content
and emitting only its own tags, because a model that has been reading the open
web is hostile input.

```
app/               pages, components, composables, the two locales
server/api/        endpoints, one file per route
server/db/         schema and the migration-free bootstrap
server/utils/      Hermes client, run watcher, auth, tokens, push, pricing
server/middleware/ the configuration guard, in front of every request
scripts/chat       the tool agents use to post reports and ship cost records
```

Three decisions worth knowing before changing things:

**Runs are not awaited.** `POST /v1/runs` returns an id; `messages.get`
collects the result. The database is the source of truth, so nothing depends on
a process staying alive.

**One reader on the event stream.** Hermes discards a run's event queue when a
subscriber disconnects, so `server/utils/watcher.ts` owns it for the life of
the run and writes both progress and approval requests. The polling path knows
this and steps aside.

**Costs are taken, not computed.** Hermes' `prompt_tokens` includes cache
reads, which cost a tenth of fresh input. An earlier version priced the sum at
the input rate and overstated the bill fivefold. The figures now come from
Hermes' own accounting; the local price table is a fallback.

## Deploying

Any Node host works. On [Coolify](https://coolify.io) use
`build_pack: railpack` — under Nixpacks `npm ci` fails on missing native
Rolldown libraries, and a static build does not build at all. Give it a volume
for `HERMES_UI_DB`.

## Limits

- **SQLite tolerates one writer.** Fine for a team with agents; hundreds of
  concurrent people would want Postgres.
- **The rate limiter counts in memory.** Attempts reset on restart, and
  several instances would each count for themselves.
- **No mail.** Invitations are links you pass on yourself.
- **A new profile needs a restart.** Creating one through an operator bot
  works, but its gateway starts with the Hermes container.
- **`/api/users` shows colleagues' addresses** to anyone signed in. Intended
  for a team; a decision for anything larger.
- **No two-factor sign-in, and no server-side session revocation.** Sessions
  are sealed cookies valid for 30 days from sign-in.

## Security

Passwords are scrypt hashes. Bot keys and invitation links are stored as
SHA-256 only and shown once. Sign-in, invitations and the bot key are rate
limited. Session cookies are `HttpOnly`, `Secure`, `SameSite=Lax`.

An agent marked **operator** may be asked to run shell commands on its host —
that is how a Hermes profile gets created from here. It is admin-only and the
instruction is fixed text with substituted values, never a command typed by a
user, but it is the largest privilege in the application. Leave the flag off
unless you want it.

Found something? Please report it privately rather than in a public issue.

## License

MIT — see [LICENSE](LICENSE).
