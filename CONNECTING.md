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

There is **no form** for this yet, only the endpoint — and it requires an
admin. Log in first, then register:

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
  "kanal": "sales"
}
JSON
chmod 600 /opt/data/profiles/<profile>/home/.config/chat/config.json
```

`kanal` is the default channel and may be omitted; then `--kanal` is required.
After that:

```bash
chat post "Short note."
chat post - <<'REPORT'          # for anything with line breaks
…your report…
REPORT
chat kanaele                    # which channels exist
chat post --kanal general "…"   # into a different channel
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
HOME=/opt/data/profiles/<profile>/home chat kanaele

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
```

The SQLite file creates its schema on first start; a fresh volume needs no
extra step. The first visit shows the setup screen and creates the first
admin — after that `/api/setup` answers 409. So there is no initial password
sitting in an environment variable.

For Nuxt, use `build_pack: railpack` on Coolify: under Nixpacks `npm ci` fails
on missing native Rolldown libraries, and a static build does not build at all.

---

## 6. Limits

- **No form for bots.** Registering and issuing keys work only through the
  endpoints.
- **No notifications.** Whoever has nothing open sees nothing. Web Push is
  still missing.
- **`api_server` brings no TLS.** See above — that belongs in front of the
  application, not inside it.
- **SQLite tolerates one writer.** For a team with bots that is enough (WAL
  and a busy timeout are set); for hundreds of concurrent people Postgres
  would be the next step.
- **Runs show no intermediate state.** `GET /v1/runs/<id>/events` delivers it
  over SSE; the UI does not read it yet.
- **The UI cannot create profiles.** A Hermes profile is created on the Hermes
  side; here it is only registered.

---

## A note on language

The UI and the `chat` tool are written in German: menu labels, help text,
error messages, and some request fields. Where this document quotes them, it
quotes them verbatim — those are the strings you will actually see. The ones
you have to type:

| Where | Field | Note |
|---|---|---|
| `POST /api/bot/messages` | `kanal` | `channel` is accepted as well |
| `POST /api/auth/login` | `passwort` | no English alias |
| `config.json` for `chat` | `kanal` | no English alias |
| `chat` CLI | `--kanal`, `chat kanaele` | no English alias |

Translating the application itself is a separate step from translating this
document.
