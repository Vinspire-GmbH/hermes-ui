<script setup lang="ts">
/**
 * What the agents cost.
 *
 * The page shows the token buckets next to the money on purpose. They tell
 * opposite stories — cache reads are most of the tokens and almost none of
 * the spend — and an earlier version of this page, which priced the sum of
 * the buckets at the input rate, overstated the bill fivefold. Showing both
 * is what makes that mistake visible rather than plausible.
 */
const { me, load } = useConsole()
const { t, locale } = useI18n()

await load()
if (!me.value) await navigateTo('/login')

const days = ref(30)
const data = ref<any>(null)
const loading = ref(true)

async function fetchUsage() {
  loading.value = true
  try {
    data.value = await $fetch('/api/usage', { query: { days: days.value } })
  } finally {
    loading.value = false
  }
}
onMounted(fetchUsage)
watch(days, fetchUsage)

const money = (usd: number) => {
  const f = new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD' })
  // Below a cent, currency formatting rounds to zero and hides the difference
  // between "nearly nothing" and "nothing".
  return usd >= 0.01 || usd === 0 ? f.format(usd) : `< ${f.format(0.01)}`
}
const num = (n: number) => new Intl.NumberFormat(locale.value).format(n)

/** Bar height relative to the most expensive day in the window. */
const peak = computed(() =>
  Math.max(1e-9, ...(data.value?.days || []).map((d: any) => d.usd)))

/** The four buckets as shares, so the shape of a bill is readable at a glance. */
function shares(b: any) {
  const total = b.input + b.cacheRead + b.cacheWrite + b.output
  if (!total) return []
  return [
    { key: 'fresh', n: b.input, colour: '#22d3ee' },
    { key: 'cacheRead', n: b.cacheRead, colour: '#818cf8' },
    { key: 'cacheWrite', n: b.cacheWrite, colour: '#e879f9' },
    { key: 'output', n: b.output, colour: '#a3e635' },
  ].filter(s => s.n > 0).map(s => ({ ...s, pct: (s.n / total) * 100 }))
}

const SOURCE_LABEL: Record<string, string> = {
  actual: 'usage.sourceActual',
  estimated: 'usage.sourceEstimated',
  local: 'usage.sourceLocal',
  unpriced: 'usage.sourceUnpriced',
}
</script>

<template>
  <div class="flex h-screen">
    <Sidebar />

    <main class="flex-1 overflow-y-auto scroller">
      <AppHeader>
        <h1 class="font-mono text-sm tracking-[.2em] uppercase text-cyan">{{ t('usage.title') }}</h1>
        <span class="meta hidden sm:inline">{{ t('usage.subtitle') }}</span>
        <select v-model.number="days" class="field text-xs w-24 ml-auto">
          <option :value="7">7</option>
          <option :value="30">30</option>
          <option :value="90">90</option>
          <option :value="365">365</option>
        </select>
      </AppHeader>

      <div class="p-4 lg:p-6 max-w-4xl space-y-6">
        <p v-if="loading" class="meta">{{ t('common.loading') }}</p>

        <template v-else-if="data">
          <!-- Total -->
          <section class="panel panel-clip bracket p-5">
            <h2 class="label">{{ t('usage.window', { days: data.window }) }}</h2>
            <p class="text-3xl font-mono text-cyan mt-2">{{ money(data.total.usd) }}</p>
            <p v-if="data.coveredDays" class="text-sm text-muted mt-1">
              {{ t('usage.perMonth', { amount: money(data.perMonth) }) }}
              <span class="meta">· {{ t('usage.extrapolated', { days: data.coveredDays }) }}</span>
            </p>
            <p class="meta mt-2">
              {{ t('usage.runs', { count: data.total.runs }) }}
              · {{ t('usage.calls', { count: data.total.apiCalls }) }}
            </p>

            <!-- Token buckets -->
            <div v-if="shares(data.total).length" class="mt-4">
              <h3 class="label mb-2">{{ t('usage.tokens') }}</h3>
              <div class="flex h-2 overflow-hidden">
                <div v-for="s in shares(data.total)" :key="s.key"
                     :style="{ width: `${s.pct}%`, background: s.colour }"
                     :title="`${t('usage.' + s.key)}: ${num(s.n)}`" />
              </div>
              <ul class="mt-2 grid sm:grid-cols-2 gap-x-6 text-sm">
                <li v-for="s in shares(data.total)" :key="s.key" class="flex items-center gap-2">
                  <span class="w-1.5 h-1.5 shrink-0" :style="{ background: s.colour }" />
                  <span class="text-muted">{{ t('usage.' + s.key) }}</span>
                  <span class="meta ml-auto">{{ num(s.n) }} · {{ s.pct.toFixed(1) }} %</span>
                </li>
              </ul>
              <p class="meta mt-3">{{ t('usage.cacheNote') }}</p>
            </div>

            <p v-if="data.total.unpriced" class="text-sm text-amber mt-3">
              {{ t('usage.unpricedNote', { count: data.total.unpriced }) }}
            </p>
            <p v-if="!data.total.runs" class="text-sm text-muted mt-3">{{ t('usage.none') }}</p>
          </section>

          <!-- Where the figures come from -->
          <section v-if="Object.keys(data.bySource).length" class="panel panel-clip p-5">
            <h2 class="label mb-2">{{ t('usage.source') }}</h2>
            <ul class="text-sm space-y-1">
              <li v-for="(usd, src) in data.bySource" :key="src" class="flex gap-3">
                <span class="text-muted">{{ SOURCE_LABEL[src] ? t(SOURCE_LABEL[src]) : src }}</span>
                <span class="font-mono text-xs ml-auto">{{ money(usd as number) }}</span>
              </li>
            </ul>
          </section>

          <!-- Per day -->
          <section v-if="data.days.length > 1" class="panel panel-clip bracket p-5">
            <h2 class="label mb-4">{{ t('usage.perDay') }}</h2>
            <div class="flex items-end gap-px h-24 overflow-x-auto">
              <div v-for="d in data.days" :key="d.day"
                   class="flex-1 min-w-1 bg-cyan/70 hover:bg-cyan transition-colors"
                   :style="{ height: `${Math.max(2, (d.usd / peak) * 100)}%` }"
                   :title="`${d.day} · ${money(d.usd)}`" />
            </div>
            <div class="flex justify-between meta mt-1">
              <span>{{ data.days[0]?.day }}</span>
              <span>{{ data.days[data.days.length - 1]?.day }}</span>
            </div>
          </section>

          <!-- Per agent -->
          <section v-if="data.bots.length" class="panel panel-clip bracket p-5">
            <h2 class="label mb-3">{{ t('usage.perBot') }}</h2>
            <ul class="divide-y divide-edge">
              <li v-for="b in data.bots" :key="b.key" class="py-2">
                <div class="flex items-center gap-3 text-sm">
                  <span class="w-1.5 h-1.5 shrink-0"
                        :style="{ background: b.colour || '#22d3ee', boxShadow: `0 0 8px ${b.colour || '#22d3ee'}` }" />
                  <span>{{ b.label }}</span>
                  <span class="meta">{{ t('usage.runs', { count: b.runs }) }}</span>
                  <span class="meta hidden sm:inline">{{ t('usage.calls', { count: b.apiCalls }) }}</span>
                  <span class="font-mono text-xs ml-auto"
                        :class="b.unpriced ? 'text-amber' : 'text-cyan'">{{ money(b.usd) }}</span>
                </div>
                <div class="flex h-1 mt-1.5 ml-5 overflow-hidden">
                  <div v-for="s in shares(b)" :key="s.key"
                       :style="{ width: `${s.pct}%`, background: s.colour }" />
                </div>
              </li>
            </ul>
          </section>

          <!-- Per scheduled job -->
          <section v-if="data.jobs.length" class="panel panel-clip bracket p-5">
            <h2 class="label mb-3">{{ t('usage.perJob') }}</h2>
            <ul class="divide-y divide-edge">
              <li v-for="j in data.jobs" :key="j.key" class="py-2 flex items-center gap-3 text-sm">
                <span class="w-1.5 h-1.5 shrink-0" :style="{ background: j.colour || '#22d3ee' }" />
                <span class="truncate">{{ j.label }}</span>
                <span class="meta shrink-0">{{ t('usage.runs', { count: j.runs }) }}</span>
                <span class="font-mono text-xs ml-auto shrink-0"
                      :class="j.unpriced ? 'text-amber' : 'text-cyan'">
                  {{ money(j.usd) }}
                  <span class="text-faint">· {{ money(j.usd / Math.max(1, j.runs)) }}</span>
                </span>
              </li>
            </ul>
          </section>

          <p class="meta">{{ t('usage.priced', { models: data.pricedModels.join(', ') }) }}</p>
        </template>
      </div>
    </main>
  </div>
</template>
