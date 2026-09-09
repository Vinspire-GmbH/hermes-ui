<script setup lang="ts">
/**
 * What the agents cost.
 *
 * Two aggregations, because there are two questions: which agent is expensive,
 * and which nightly job is expensive. A per-day bar sits above them so a jump
 * is visible without reading numbers.
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

const money = (usd: number) =>
  usd >= 0.01 || usd === 0
    ? new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD' }).format(usd)
    // Below a cent, currency formatting rounds everything to $0.00 and hides
    // the difference between "nearly nothing" and "nothing".
    : `< ${new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD' }).format(0.01)}`

const num = (n: number) => new Intl.NumberFormat(locale.value).format(n)

/** Bar height relative to the most expensive day in the window. */
const peak = computed(() =>
  Math.max(1e-9, ...(data.value?.days || []).map((d: any) => d.usd)))
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
            <p class="meta mt-1">
              {{ t('usage.tokens', {
                input: num(data.total.input), output: num(data.total.output),
              }) }}
              · {{ t('usage.runs', { count: data.total.runs }) }}
            </p>
            <p v-if="data.total.unpriced" class="text-sm text-amber mt-3">
              {{ t('usage.unpricedNote', { count: data.total.unpriced }) }}
            </p>
            <p v-if="!data.total.runs" class="text-sm text-muted mt-3">{{ t('usage.none') }}</p>
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
              <li v-for="b in data.bots" :key="b.key" class="py-2 flex items-center gap-3 text-sm">
                <span class="w-1.5 h-1.5 shrink-0"
                      :style="{ background: b.colour || '#22d3ee', boxShadow: `0 0 8px ${b.colour || '#22d3ee'}` }" />
                <span>{{ b.label }}</span>
                <span class="meta">{{ t('usage.runs', { count: b.runs }) }}</span>
                <span class="meta hidden sm:inline">
                  {{ t('usage.tokens', { input: num(b.input), output: num(b.output) }) }}
                </span>
                <span class="font-mono text-xs ml-auto"
                      :class="b.unpriced ? 'text-amber' : 'text-cyan'">{{ money(b.usd) }}</span>
              </li>
            </ul>
          </section>

          <!-- Per scheduled job -->
          <section v-if="data.jobs.length" class="panel panel-clip bracket p-5">
            <h2 class="label mb-3">{{ t('usage.perJob') }}</h2>
            <ul class="divide-y divide-edge">
              <li v-for="j in data.jobs" :key="j.key" class="py-2 flex items-center gap-3 text-sm">
                <span class="w-1.5 h-1.5 shrink-0"
                      :style="{ background: j.colour || '#22d3ee' }" />
                <span class="truncate">{{ j.label }}</span>
                <span class="meta shrink-0">{{ t('usage.runs', { count: j.runs }) }}</span>
                <span class="font-mono text-xs ml-auto shrink-0"
                      :class="j.unpriced ? 'text-amber' : 'text-cyan'">{{ money(j.usd) }}</span>
              </li>
            </ul>
          </section>

          <p class="meta">{{ t('usage.priced', { models: data.pricedModels.join(', ') }) }}</p>
        </template>
      </div>
    </main>
  </div>
</template>
