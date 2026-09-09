# Connecting a Hermes instance

This UI is not tied to one Hermes installation. Every bot carries its own
address and its own key, so bots from several instances — on several servers —
can sit in the same channels.

There are **two directions** to connect, and only the first one takes work:

```
                  chatting (you write, the bot answers)
   UI  ─────────────────────────────────────────────────────▶  Hermes
   (Nuxt)               POST /v1/runs, api_server                (agent)
     ▲
     └────────────────────────────────────────────────────────────┘
                  reporting (cron reports, nobody asked)
                  POST /api/bot/messages, the `chat` tool
```

The outbound direction needs a reachable address. The inbound one needs only a
key and travels over ordinary HTTPS — from any server, with no open ports.

---

## 1. On the Hermes side: enable `api_server`

The UI talks to the **`api_server` platform** — an OpenAI-compatible interface
per profile, with persistent sessions. One of its endpoints is literally
`GET /v1/capabilities`, "for external UIs": this is an intended point of
attachment, not a workaround.

Three settings and one key per profile:

```bash
hermes -p <profile> config set platforms.api_server.enabled true
hermes -p <profile> config set platforms.api_server.port 9200
hermes -p <profile> config set platforms.api_server.extra.host 0.0.0.0
```

Plus `API_SERVER_KEY=<long random value>` in that **profile's** `.env`.
Profiles inherit nothing from one another — each wants its own entry. Without
`extra.host` the platform listens on `127.0.0.1` inside the container and is
reachable from nowhere; that is the most common failure.

If more than one profile runs on the same machine, each needs its own port
(9200, 9201, 9202 and so on).

Check it from wherever the UI will run:

```bash
curl -s -H "Authorization: Bearer $API_SERVER_KEY" http://<host>:9200/v1/models
```

**The model id is the profile name** — only the root profile `default` is
called `hermes-agent`. A wrong name is rejected. Whatever `/v1/models` returns
is the value that later goes into the `model` field.

### Reachability — and a warning

`api_server` speaks **plain HTTP with a bearer key**. There is no setting for
certificates; TLS is the job of whatever sits in front of it. So do not put
the port on the open internet. Three ways, in this order:

1. **Same Docker host** — put the containers on a shared network and use the
   service name: `http://hermes-<id>:9200`. Nothing is published, nothing is
   visible from outside. The simplest case.
2. **Different server, reverse proxy in front** — Traefik, Caddy or nginx with
   its own domain and certificate, proxying to the port. Then `apiBase` is the
   `https://` address.
3. **Different server, no proxy** — WireGuard or a tunnel between the two
   machines, and the address is the private one.

A `curl` from outside against the port should return *nothing*. And beware:
**published container ports bypass `ufw`.** What `ufw status` says is not
proof; measure from a foreign machine.

---

## 2. Register the bot in the UI

Sign in as an administrator and go to **Admin → Bots → New bot**. The wizard
walks through identity, an optional SOUL interview, the connection (with a
"test connection" button that reports the model ids the instance offers) and a
final review.

Everything it does is also available as endpoints, which is the better route
for scripting a fleet:

```bash
curl -s -c cookies.txt -X POST https://<your-ui>/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","passwort":"…"}'

curl -s -b cookies.txt -X POST https://<your-ui>/api/bots \
  -H 'Content-Type: application/json' \
  -d '{"name":"Erika",
       "slug":"erika",
       "profile":"erika-sales",
       "apiBase":"https://hermes2.example.com",
       "apiKey":"<API_SERVER_KEY of that profile>",
       "model":"erika-sales",
       "color":"#8a4f6d",
       "description":"Sales, quotes, follow-ups"}'
```

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | display name |
| `apiBase` | yes | root of the address, **without** `/v1` |
| `apiKey` | yes | the profile's `API_SERVER_KEY` |
| `profile` | yes | profile name on the Hermes side, for traceability |
| `model` | no | model id; if absent, `hermes-agent` is used |
| `slug` | no | the handle for `@erika`; derived from the name if absent |
| `color`, `description` | no | presentation |

The endpoint calls `/v1/models` before saving. **A bot the UI cannot reach
does not enter the list** — the error arrives immediately rather than at the
first message. `apiKey` and `apiBase` stay server-side; `GET /api/bots` never
hands them out.

Typical responses:

| Message | Cause |
|---|---|
| `502 Bot nicht erreichbar` | address, port, `extra.host` or network |
| `502 … Invalid API key` | `API_SERVER_KEY` is missing from **this** profile's `.env` |
| `409 Kürzel schon vergeben` | that `slug` already exists |

### Create a channel and invite

```bash
curl -s -b cookies.txt -X POST https://<your-ui>/api/channels \
  -H 'Content-Type: application/json' -d '{"name":"sales","topic":"Quotes"}'

curl -s -b cookies.txt -X POST https://<your-ui>/api/channels/<channel-id>/members \
  -H 'Content-Type: application/json' -d '{"kind":"bot","refId":"<bot-id>"}'
```

`GET /api/bots` gives you the bot ids. Creating channels and inviting also
works in the UI itself, which is the more comfortable route.

**In a channel a bot answers only when mentioned with `@handle`.** That is
deliberate: otherwise every word between colleagues triggers all the agents
present, and each run costs the full context. In a direct message the bot is
always the one being addressed, so no mention is needed there.

---

## 3. The way back: the bot reports on its own

Hermes can only deliver to **its own platforms** — `slack`, `telegram`,
`mattermost`, `email` and the rest of the `Platform` enum. This UI is not one
of them, and the `webhook` platform does not help: that one is strictly
*inbound*, so external services can trigger an agent run.

Hence the counterpart to Slack's bot token: **the bot writes by itself.**

Issue a key — the plaintext appears in this one response only, and just its
SHA-256 is stored:

```bash
curl -s -b cookies.txt -X POST https://<your-ui>/api/bots/<bot-id>/tokens \
  -H 'Content-Type: application/json' -d '{"label":"cron"}'
# → { "bot": "erika", "token": "hui-…", "prefix": "hui-abcd1234", … }
```

Put the tool and its credentials on the Hermes side:

```bash
# the tool anywhere on the agent's PATH, inside the volume
install -m 755 scripts/chat /opt/data/.local/bin/chat

# credentials into the profile's HOME
mkdir -p /opt/data/profiles/<profile>/home/.config/chat
cat > /opt/data/profiles/<profile>/home/.config/chat/config.json <<'JSON'
{
  "base_url": "https://<your-ui>",
  "token": "hui-…",
  "channel": "sales"
}
JSON
chmod 600 /opt/data/profiles/<profile>/home/.config/chat/config.json
```

`channel` is the default channel and may be omitted; then `--channel` is
required. After that:

```bash
chat post "Short note."
chat post - <<'REPORT'          # for anything with line breaks
…your report…
REPORT
chat channels                     # which channels exist
chat post --channel general "…"   # into a different channel
```

The tool needs **no third-party libraries** — just `python3` and the standard
library, because a tool call's environment is sanitized and brings no
`requests` with it.

Two properties of the endpoint worth knowing:

- It **does not start an agent run.** The bot has already done the work; it is
  only reporting. Mentions in the text therefore trigger nothing on purpose —
  otherwise a report could answer itself.
- If the bot is not a member of the channel, membership is **created** rather
  than the message rejected. A report lost at 07:00 is more expensive than a
  bot showing up somewhere; whoever does not want it there removes it.

### Wiring up cron jobs

Two routes, depending on who writes the report.

**The agent reports** — append a paragraph to the prompt:

```
Report to the UI: at the end, send your report with `chat` into your channel.
You do not name the channel, it is in the configuration. Use standard input
because of the line breaks:

    chat post - <<'REPORT'
    ...your report...
    REPORT

This is a report, not a message to someone — it triggers no answer. Send it
exactly once.
```

Always through `hermes cron edit <id> --prompt "…"`, **not** by writing to
`cron/jobs.json`: the ticker holds that file open.

**A script reports** — then it calls `chat` itself. That is the deterministic
route, without a model and without the question of whether the agent follows
the instruction. The better one for watchdogs and threshold alerts.

It also pays to mention `chat` in the bot's SOUL. Then it knows the tool
exists during a conversation, and you can tell it: "post that to #general".

---

## 4. Checklist

```bash
# 1. api_server answers, from where the UI runs
curl -s -H "Authorization: Bearer $KEY" http://<host>:9200/v1/models

# 2. the bot is registered
curl -s -b cookies.txt https://<your-ui>/api/bots

# 3. the way back works — as the bot, with its HOME
HOME=/opt/data/profiles/<profile>/home chat channels

# 4. end to end: write "@handle hello" in the UI
```

If an answer in the UI stays on "thinking …", the run is still open — answers
are collected when messages are reloaded, including after a restart of the
application. A run that uses tools easily takes a minute; that is normal and
not a timeout.

---

## 5. What the UI itself needs

```bash
NUXT_SESSION_PASSWORD=<at least 32 characters>   # required, for the cookies
HERMES_UI_DB=/data/hermes-ui.db                  # put this on a volume

# Token prices for the cost page, USD per million tokens. Anthropic models
# ship with defaults; anything else is counted in tokens and left out of the
# money total until it is listed here.
MODEL_PRICES={"my-model":{"in":3,"out":15}}

# Web Push. Without these, notifications stay switched off rather than
# failing — generate a pair with:  npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:you@example.com

# How many proxy hops in front of this app you own. Left unset it means one —
# the reverse proxy directly in front. It decides which entry of
# X-Forwarded-For the rate limiter counts against; too high and a client can
# claim a fresh address per request, too low and everyone behind your CDN
# shares one bucket.
TRUSTED_PROXY_HOPS=1
```

The SQLite file creates its schema on first start; a fresh volume needs no
extra step. The first visit shows the setup screen and creates the first
admin — after that `/api/setup` answers 409. So there is no initial password
sitting in an environment variable.

For Nuxt, use `build_pack: railpack` on Coolify: under Nixpacks `npm ci` fails
on missing native Rolldown libraries, and a static build does not build at all.

---

## 6. People, notifications, and building a persona

**Inviting.** Admin → People issues a link that is valid for fourteen days.
No mail is sent: this console has no mail server, and one that silently fails
to deliver is worse than none. Only the link's SHA-256 is stored, so it is
shown exactly once and cannot be recovered — issue a new one instead.

**Notifications.** Once the VAPID keys are set, each person turns push on per
browser under Admin → Notifications. A notification goes out when someone
posts in a channel you belong to, when a bot's answer finally lands (which is
the case that matters — by then nobody is still watching the window), and when
a cron report arrives. The author never gets notified about their own message.
The page is installable as a PWA; on a phone that is also what makes push work
at all under iOS.

**Cost.** The Cost page adds up what the agents spent, per agent and per
scheduled job, and shows the four token buckets beside the money.

The figures are Hermes'. It keeps them in the `sessions` table of each
profile's `state.db` — the buckets kept apart plus a cost it computed with its
own price table — and no endpoint exposes it, so the `chat` tool ships it:

```bash
chat usage --tage 7      # send the last week's sessions
```

`session:<id>` is the key on this side, unique, so an overlapping range
re-sends harmlessly and a session that grew since the last shipment is brought
up to date. One daily cron job per profile keeps the page current.

**Why the cost is taken and not computed here.** The first version of this
page did compute it, from Hermes' cron audit file, and overstated the bill by
roughly five times. That file reports `prompt_tokens`, and in
`agent/usage_pricing.py`:

```python
@property
def prompt_tokens(self) -> int:
    return self.input_tokens + self.cache_read_tokens + self.cache_write_tokens
```

Priced at the input rate that looks enormous. Measured on one agent over 26
days: 0.02 % fresh input, 90.4 % cache reads, 9.6 % cache writes — and cache
reads cost a tenth of fresh input. The local price table in
`server/utils/pricing.ts` survives only as a fallback for a model Hermes could
not price, and it prices all four buckets separately. `MODEL_PRICES` extends
it without a deploy.

**Seeing the schedule.** The Schedule page lists every profile's cron jobs,
sorted by next run across all of them — the question it answers is "what
happens next", which grouping by owner would turn back into mental
arithmetic. Source is `GET /api/jobs` on the api_server platform, so it needs
no credential beyond the one the bot already has. It is read-only: pausing,
resuming and running a job now exist as endpoints on the Hermes side
(`POST /api/jobs/{id}/pause|resume|run`) but are not wired into this page.

**Building a SOUL.** Step 2 of the bot wizard is an interview: an existing bot
asks one question at a time about what the new agent is responsible for, what
it must not touch, which tools it has, and what it should remember, then writes
the SOUL.md. You can edit the result, download it, or have it applied.

Applying takes an unobvious route worth explaining. Hermes has a dashboard API
with `POST /api/profiles` and `PUT /api/profiles/{name}/soul` — exactly the two
calls needed — but that dashboard is guarded by a session cookie minted at
start-up, so nothing outside it can hold a durable credential. What does work
is the agent itself: it has a shell and `hermes` on its PATH. So a bot marked
**operator** in its settings is asked to run the commands: create the profile
(cloned from an existing one, so it inherits a model and credentials — a fresh
profile has neither and cannot answer), write SOUL.md, switch on `api_server`
on a free port, and add an `API_SERVER_KEY` to the profile's `.env`. It reports
back what it did.

Two things to know about that. The instruction is fixed text with substituted
values, never a command typed by a user — but it is still shell work handed to
a model, which is why it is admin-only and why an operator bot has to be marked
deliberately. And the new platform starts with the Hermes container, so the bot
becomes reachable after a restart, not immediately.

---

## 7. Limits

- **`api_server` brings no TLS.** See above — that belongs in front of the
  application, not inside it.
- **The rate limiter counts in memory.** Attempts reset on restart, and
  behind several instances each would count for itself. One process on one
  SQLite file is the shape this app has; if that changes, the counters belong
  in the database.
- **SQLite tolerates one writer.** For a team with bots that is enough (WAL
  and a busy timeout are set); for hundreds of concurrent people Postgres
  would be the next step.
- **Runs show no intermediate state.** `GET /v1/runs/<id>/events` delivers it
  over SSE; the UI does not read it yet.
- **A new profile needs a restart.** Creating one through an operator bot
  works, but its gateway starts with the Hermes container.
- **No mail.** Invitations are links you pass on yourself.
- **Markdown is rendered by a small renderer of its own**, not by a library:
  headings, emphasis, code, links, lists, quotes, rules and tables. Every
  character of content is escaped and only its own tags are emitted, so no
  input HTML can reach the page — a model that has been reading the open web
  is hostile input. Anything outside that subset shows as literal text.

---

## A note on language

The interface speaks English and German; it picks from `Accept-Language` on
the first visit and remembers a choice per account. Add a language by dropping
a file next to `app/i18n/en.ts` and listing it in `app/composables/useI18n.ts`
— there is no i18n module to configure.

Every request field and every route is English. The first release used German
names in three places, and those are still accepted so an installation does
not break between deploying this and editing its config files:

| Where | Current | Still accepted |
|---|---|---|
| `POST /api/bot/messages` | `channel`, `thread` | `kanal`, `faden` |
| `config.json` for `chat` | `channel` | `kanal` |
| `chat` CLI | `--channel`, `chat channels`, `--days`, `--file` | `--kanal`, `chat kanaele`, `--tage`, `--datei` |

Everything else — routes, fields, error messages, and the `chat` tool's own
help and output — is English.
