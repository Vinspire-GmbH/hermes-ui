/**
 * What a thousand tokens costs, per model.
 *
 * Prices are USD per million tokens as published by the providers. They change,
 * and a wrong number here is worse than none — so an unknown model yields
 * `null` rather than a guess, and the interface says "unpriced" instead of
 * showing a confident zero.
 *
 * Override or extend without a deploy through `MODEL_PRICES`, a JSON object of
 * `{ "model-id": { "in": 3, "out": 15 } }`.
 */
interface Price { in: number, out: number }

const BUILT_IN: Record<string, Price> = {
  // Anthropic
  'claude-opus-5': { in: 15, out: 75 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-fable-5-1': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
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
 * Cost in USD, or null when the model is not priced.
 *
 * Matching is exact first, then by longest known prefix: providers append
 * dated suffixes (`claude-sonnet-5-20260501`) that should not cost nothing
 * merely because the string grew.
 */
export function cost(model: string | null, inputTokens: number, outputTokens: number): number | null {
  if (!model) return null
  const prices = table()
  let price = prices[model]
  if (!price) {
    const match = Object.keys(prices)
      .filter(k => model.startsWith(k))
      .sort((a, b) => b.length - a.length)[0]
    if (match) price = prices[match]
  }
  if (!price) return null
  return (inputTokens / 1e6) * price.in + (outputTokens / 1e6) * price.out
}

/** Which models this instance can price, for the interface to explain itself. */
export function pricedModels(): string[] {
  return Object.keys(table()).sort()
}
