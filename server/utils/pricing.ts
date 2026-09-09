/**
 * Prices, as a fallback only.
 *
 * The cost figures on the Cost page come from Hermes, which computes them with
 * its own price table and — crucially — with the cache split. This module
 * exists for the rows where Hermes had no price, so the page can still say
 * something rather than showing a confident zero.
 *
 * Four rates, not two. That is the whole lesson of the miscount this replaced:
 * an agent's input is dominated by cache reads, which cost a tenth of fresh
 * input, and by cache writes, which cost more. Pricing the sum at the input
 * rate overstated the bill roughly fivefold. Measured on one agent over 26
 * days: 0.02 % fresh input, 90.4 % cache reads, 9.6 % cache writes.
 *
 * Extend or correct without a deploy through `MODEL_PRICES`, a JSON object of
 * `{ "model-id": { "in": 3, "out": 15, "cacheRead": 0.3, "cacheWrite": 3.75 } }`.
 * `cacheRead` and `cacheWrite` may be omitted; they then follow Anthropic's
 * ratios of a tenth and one and a quarter of the input rate.
 */
export interface Price {
  in: number
  out: number
  cacheRead?: number
  cacheWrite?: number
}

export interface Buckets {
  input: number
  cacheRead: number
  cacheWrite: number
  output: number
}

/**
 * USD per million tokens, mirroring Hermes' own table in
 * `agent/usage_pricing.py` so the two do not disagree.
 */
const BUILT_IN: Record<string, Price> = {
  'claude-opus-5': { in: 15, out: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-sonnet-5': { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku-4-5': { in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 },
}

let overrides: Record<string, Price> | null = null

function table(): Record<string, Price> {
  if (overrides === null) {
    try {
      overrides = JSON.parse(process.env.MODEL_PRICES || '{}')
    } catch {
      overrides = {}
    }
  }
  return { ...BUILT_IN, ...overrides }
}

/**
 * Look a model up: exact match first, then the longest known prefix.
 *
 * Providers append dated suffixes (`claude-sonnet-5-20260501`), and a model
 * should not become unpriced merely because its name grew.
 */
function priceFor(model: string): Price | undefined {
  const prices = table()
  if (prices[model]) return prices[model]
  const match = Object.keys(prices)
    .filter(k => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0]
  return match ? prices[match] : undefined
}

/** Cost in USD from the four buckets, or null when the model is not priced. */
export function cost(model: string | null, b: Buckets): number | null {
  if (!model) return null
  const p = priceFor(model)
  if (!p) return null
  const cacheRead = p.cacheRead ?? p.in * 0.1
  const cacheWrite = p.cacheWrite ?? p.in * 1.25
  return (b.input / 1e6) * p.in
    + (b.cacheRead / 1e6) * cacheRead
    + (b.cacheWrite / 1e6) * cacheWrite
    + (b.output / 1e6) * p.out
}

/** Which models this instance can price, for the interface to explain itself. */
export function pricedModels(): string[] {
  return Object.keys(table()).sort()
}
