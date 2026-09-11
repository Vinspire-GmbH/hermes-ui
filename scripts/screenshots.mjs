/**
 * Regenerate the README screenshots.
 *
 * Uses the system Chrome through puppeteer-core, so nothing downloads a
 * 200 MB Chromium. Seed a database with scripts/demo-seed.mjs first, start
 * the application against it, then:
 *
 *   npm i --no-save puppeteer-core
 *   BASE=http://127.0.0.1:3000 OUT=docs node scripts/screenshots.mjs
 */
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://127.0.0.1:3388'
const OUT = process.env.OUT || '.'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--force-color-profile=srgb', '--hide-scrollbars'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
// Chrome inherits the system language and the interface follows it. The
// README is English, so the screenshots have to be.
await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })

// Sign in through the API so the session cookie is set.
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' })
const ok = await page.evaluate(async (base) => {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dana@example.com', password: 'screenshot-only' }),
  })
  return r.status
}, BASE)
if (ok !== 200) { console.error('  sign-in failed:', ok); process.exit(1) }
await page.setCookie({ name: 'locale', value: 'en', url: BASE, path: '/' })

const seiten = [
  ['channel', '/', 'die Konsole: Kanal mit gerendertem Bericht'],
  ['approval', '/', 'Freigabe'],
  ['cost', '/usage', 'Kostenansicht'],
  ['schedule', '/crons', 'Zeitplan'],
]

// The research channel first — that is where the rendered report is.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
await new Promise(r => setTimeout(r, 1500))
const links = await page.$$eval('aside a', as => as.map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim() })))
const research = links.find(l => l.text.includes('research'))
const general = links.find(l => l.text.includes('general'))

async function shoot(name, path, wait = 2200) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' })
  await new Promise(r => setTimeout(r, wait))
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(`  ${name}.png  ←  ${path}`)
}

if (research) await shoot('console', research.href)
if (general) await shoot('approval', general.href)
await shoot('cost', '/usage')
await shoot('schedule', '/crons')

await browser.close()
