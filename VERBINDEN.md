# Eine Hermes-Instanz anbinden

Diese Oberfläche ist nicht an eine Hermes-Installation gebunden. Jeder Bot
trägt seine eigene Adresse und seinen eigenen Schlüssel, also können Bots aus
mehreren Instanzen — auf mehreren Servern — in denselben Kanälen sitzen.

Zu verbinden sind **zwei Richtungen**, und nur die erste macht Arbeit:

```
                  chatten (du schreibst, der Bot antwortet)
   Oberfläche  ──────────────────────────────────────────────▶  Hermes
   (Nuxt)                POST /v1/runs, api_server                (Agent)
       ▲
       └──────────────────────────────────────────────────────────┘
                  melden (Cron-Berichte, ohne Zuruf)
                  POST /api/bot/messages, Werkzeug `chat`
```

Die Hinrichtung braucht eine erreichbare Adresse. Die Rückrichtung braucht nur
einen Schlüssel und läuft über gewöhnliches HTTPS — von jedem Server aus, ohne
offene Ports.

---

## 1. Auf der Hermes-Seite: `api_server` einschalten

Die Oberfläche spricht die **`api_server`-Plattform** — eine
OpenAI-kompatible Schnittstelle je Profil, mit persistenten Sitzungen. Ein
Endpunkt heißt dort wörtlich `GET /v1/capabilities`, „for external UIs": das
ist ein vorgesehener Andockpunkt, kein Umweg.

Je Profil drei Einstellungen und ein Schlüssel:

```bash
hermes -p <profil> config set platforms.api_server.enabled true
hermes -p <profil> config set platforms.api_server.port 9200
hermes -p <profil> config set platforms.api_server.extra.host 0.0.0.0
```

Dazu `API_SERVER_KEY=<langer Zufallswert>` in die `.env` **des Profils**.
Profile erben nichts voneinander — jedes will seinen eigenen Eintrag. Ohne
`extra.host` lauscht die Plattform auf `127.0.0.1` innerhalb des Containers
und ist von nirgends erreichbar; das ist der häufigste Fehlschlag.

Läuft mehr als ein Profil auf derselben Maschine, braucht jedes einen eigenen
Port (etwa 9200, 9201, 9202 …).

Prüfen, von dort aus, wo die Oberfläche später läuft:

```bash
curl -s -H "Authorization: Bearer $API_SERVER_KEY" http://<host>:9200/v1/models
```

**Die Modellkennung ist der Profilname** — nur beim Wurzelprofil `default`
heißt sie `hermes-agent`. Ein falscher Name wird abgewiesen. Was `/v1/models`
zurückgibt, ist der Wert, der später ins Feld `model` gehört.

### Erreichbarkeit — und eine Warnung

`api_server` spricht **reines HTTP mit einem Bearer-Schlüssel**. Es gibt keine
Einstellung für Zertifikate; TLS ist Sache dessen, was davor steht. Stell den
Port deshalb nicht ins offene Netz. Drei Wege, in dieser Reihenfolge:

1. **Gleicher Docker-Host** — die Container in ein gemeinsames Netz hängen und
   den Dienstnamen benutzen: `http://hermes-<id>:9200`. Nichts wird
   veröffentlicht, nichts ist von außen sichtbar. Der einfachste Fall.
2. **Anderer Server, Reverse Proxy davor** — Traefik, Caddy oder nginx mit
   eigener Domain und Zertifikat, dahinter `proxy_pass` auf den Port. Dann ist
   `apiBase` die `https://`-Adresse.
3. **Anderer Server, kein Proxy** — WireGuard oder ein Tunnel zwischen den
   beiden Maschinen, und die Adresse ist die private.

Ein `curl` von außen auf den Port sollte *nichts* liefern. Und Vorsicht:
**veröffentlichte Container-Ports umgehen `ufw`.** Was `ufw status` sagt, ist
kein Beweis; nachmessen von einer fremden Maschine aus.

---

## 2. Den Bot in der Oberfläche eintragen

Es gibt noch **kein Formular** dafür, nur den Endpunkt — und der verlangt
einen Administrator. Erst anmelden, dann eintragen:

```bash
curl -s -c cookies.txt -X POST https://<deine-oberfläche>/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"du@example.com","passwort":"…"}'

curl -s -b cookies.txt -X POST https://<deine-oberfläche>/api/bots \
  -H 'Content-Type: application/json' \
  -d '{"name":"Erika",
       "slug":"erika",
       "profile":"erika-vertrieb",
       "apiBase":"https://hermes2.example.com",
       "apiKey":"<API_SERVER_KEY des Profils>",
       "model":"erika-vertrieb",
       "color":"#8a4f6d",
       "description":"Vertrieb, Angebote, Nachfassen"}'
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `name` | ja | Anzeigename |
| `apiBase` | ja | Wurzel der Adresse, **ohne** `/v1` |
| `apiKey` | ja | `API_SERVER_KEY` des Profils |
| `profile` | ja | Profilname auf der Hermes-Seite, zur Nachvollziehbarkeit |
| `model` | nein | Modellkennung; fehlt sie, wird `hermes-agent` benutzt |
| `slug` | nein | das Kürzel für `@erika`; fehlt es, aus dem Namen gebildet |
| `color`, `description` | nein | Darstellung |

Der Endpunkt ruft vor dem Speichern `/v1/models` auf. **Ein Bot, den die
Oberfläche nicht erreicht, kommt nicht in die Liste** — der Fehler kommt
sofort und nicht erst beim ersten Zuruf. `apiKey` und `apiBase` bleiben
serverseitig; `GET /api/bots` gibt sie nie heraus.

Typische Antworten:

| Meldung | Ursache |
|---|---|
| `502 Bot nicht erreichbar` | Adresse, Port, `extra.host` oder Netz |
| `502 … Invalid API key` | `API_SERVER_KEY` steht nicht in der `.env` **dieses** Profils |
| `409 Kürzel schon vergeben` | `slug` gibt es schon |

### Kanal anlegen und einladen

```bash
curl -s -b cookies.txt -X POST https://<deine-oberfläche>/api/channels \
  -H 'Content-Type: application/json' -d '{"name":"vertrieb","topic":"Angebote"}'

curl -s -b cookies.txt -X POST https://<deine-oberfläche>/api/channels/<kanal-id>/members \
  -H 'Content-Type: application/json' -d '{"kind":"bot","refId":"<bot-id>"}'
```

Die Bot-Kennungen liefert `GET /api/bots`. Kanäle und Einladen gehen auch
direkt in der Oberfläche, das ist der bequemere Weg.

**In einem Kanal antwortet ein Bot nur, wenn er mit `@kürzel` erwähnt wird.**
Das ist Absicht: sonst löst jeder Zuruf zwischen Kollegen alle anwesenden
Agenten aus, und jeder Lauf kostet den vollen Kontext. In einer
Direktnachricht ist immer der Bot gemeint, dort braucht es keine Erwähnung.

---

## 3. Rückrichtung: der Bot meldet von selbst

Hermes kann von sich aus nur an **seine eigenen Plattformen** liefern —
`slack`, `telegram`, `mattermost`, `email` und die übrigen des
`Platform`-Enums. Diese Oberfläche ist keine davon, und die
`webhook`-Plattform hilft nicht: die ist ausschließlich *eingehend*, damit
externe Dienste einen Agentenlauf auslösen können.

Deshalb das Gegenstück zu Slacks Bot-Token: **der Bot schreibt selbst.**

Schlüssel ausstellen — der Klartext erscheint nur in dieser einen Antwort,
gespeichert wird ausschließlich sein SHA-256:

```bash
curl -s -b cookies.txt -X POST https://<deine-oberfläche>/api/bots/<bot-id>/tokens \
  -H 'Content-Type: application/json' -d '{"label":"cron"}'
# → { "bot": "erika", "token": "hui-…", "prefix": "hui-abcd1234", … }
```

Werkzeug und Zugangsdaten auf die Hermes-Seite legen:

```bash
# das Werkzeug irgendwohin in den PATH des Agenten, im Volume
install -m 755 scripts/chat /opt/data/.local/bin/chat

# Zugangsdaten ins HOME des Profils
mkdir -p /opt/data/profiles/<profil>/home/.config/chat
cat > /opt/data/profiles/<profil>/home/.config/chat/config.json <<'JSON'
{
  "base_url": "https://<deine-oberfläche>",
  "token": "hui-…",
  "kanal": "vertrieb"
}
JSON
chmod 600 /opt/data/profiles/<profil>/home/.config/chat/config.json
```

`kanal` ist der Standardkanal und darf fehlen; dann ist `--kanal` Pflicht.
Danach:

```bash
chat post "Kurze Meldung."
chat post - <<'BERICHT'          # für alles mit Zeilenumbrüchen
…dein Bericht…
BERICHT
chat kanaele                     # welche Kanäle es gibt
chat post --kanal allgemein "…"  # in einen anderen Kanal
```

Das Werkzeug braucht **keine Fremdbibliotheken** — nur `python3` mit der
Standardbibliothek, weil die Umgebung eines Werkzeugaufrufs bereinigt ist und
kein `requests` mitbringt.

Zwei Eigenschaften des Endpunkts, die man kennen sollte:

- Er **startet keinen Agentenlauf.** Der Bot hat schon gearbeitet, er
  berichtet nur. Erwähnungen im Text lösen deshalb bewusst nichts aus — sonst
  könnte sich eine Meldung selbst beantworten.
- Fehlt die Mitgliedschaft im Kanal, wird sie **angelegt** statt die Meldung
  abzuweisen. Ein um 7:00 verlorener Bericht ist teurer als ein Bot, der
  irgendwo auftaucht; wer ihn dort nicht will, wirft ihn hinaus.

### Cron-Läufe verdrahten

Zwei Wege, je nachdem, wer den Bericht schreibt.

**Der Agent berichtet** — einen Absatz an den Prompt hängen:

```
Meldung in die Oberfläche: schick deinen Bericht am Ende mit `chat` in deinen
Kanal. Den Kanal gibst du nicht an, er steht in der Konfiguration. Wegen der
Zeilenumbrüche über die Standardeingabe:

    chat post - <<'BERICHT'
    ...dein Bericht...
    BERICHT

Das ist eine Meldung, kein Zuruf — sie löst keine Antwort aus. Schick sie
genau einmal.
```

Immer über `hermes cron edit <id> --prompt "…"`, **nicht** durch Schreiben in
`cron/jobs.json`: der Ticker hält die Datei offen.

**Ein Skript berichtet** — dann ruft es `chat` selbst auf. Das ist der
deterministische Weg, ohne Modell und ohne die Frage, ob der Agent die
Anweisung befolgt. Für Wächter und Schwellenmeldungen der bessere.

Es lohnt außerdem, `chat` in der SOUL des Bots zu erwähnen. Dann weiß er im
Gespräch, dass es das Werkzeug gibt, und du kannst ihm sagen: „poste das nach
#allgemein".

---

## 4. Prüfliste

```bash
# 1. api_server antwortet, von der Oberfläche aus
curl -s -H "Authorization: Bearer $KEY" http://<host>:9200/v1/models

# 2. Bot ist eingetragen
curl -s -b cookies.txt https://<deine-oberfläche>/api/bots

# 3. Rückweg steht — als der Bot, mit seinem HOME
HOME=/opt/data/profiles/<profil>/home chat kanaele

# 4. Ende zu Ende: in der Oberfläche „@kürzel hallo" schreiben
```

Bleibt eine Antwort in der Oberfläche auf „denkt nach …" stehen, ist der Lauf
noch offen — Antworten werden nachgeholt, wenn die Nachrichten neu geladen
werden, auch nach einem Neustart der Anwendung. Ein Lauf mit Werkzeugen
dauert gut und gern eine Minute; das ist normal und kein Zeitlimit.

---

## 5. Was die Oberfläche selbst braucht

```bash
NUXT_SESSION_PASSWORD=<mindestens 32 Zeichen>   # Pflicht, für die Cookies
HERMES_UI_DB=/data/hermes-ui.db                 # auf ein Volume legen
```

Die SQLite-Datei legt das Schema beim ersten Start selbst an; ein frisches
Volume braucht keinen Zusatzschritt. Der erste Aufruf zeigt die Einrichtung
und legt den ersten Administrator an — danach antwortet `/api/setup` mit 409.
Ein Startpasswort in einer Umgebungsvariablen gibt es also nicht.

Für Nuxt gilt hier `build_pack: railpack`: unter Nixpacks scheitert `npm ci`
an fehlenden nativen Rolldown-Bibliotheken, und ein statischer Build baut
gar nicht.

---

## 6. Grenzen

- **Kein Formular für Bots.** Anlegen und Schlüsselausstellen gehen nur über
  die Endpunkte.
- **Keine Benachrichtigungen.** Wer nichts offen hat, sieht nichts. Web Push
  fehlt noch.
- **`api_server` bringt kein TLS mit.** Siehe oben — das gehört vor die
  Anwendung, nicht in sie.
- **SQLite verträgt einen Schreiber.** Für ein Team mit Bots reicht das
  (WAL und Wartezeitlimit sind gesetzt); für hunderte gleichzeitige Menschen
  wäre Postgres der nächste Schritt.
- **Läufe zeigen keinen Zwischenstand.** `GET /v1/runs/<id>/events` liefert
  ihn per SSE, die Oberfläche wertet ihn noch nicht aus.
- **Profile kann die Oberfläche nicht erzeugen.** Ein Hermes-Profil legt man
  auf der Hermes-Seite an; hier wird es nur eingetragen.
