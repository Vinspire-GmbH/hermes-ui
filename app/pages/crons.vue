<script setup lang="ts">
/**
 * What runs on its own.
 *
 * Sorted by next run across all profiles rather than grouped by bot: the
 * question this page answers is "what happens next", and grouping by owner
 * makes that the one thing you have to work out yourself. The owner is a
 * coloured dot on each row instead.
 */
const { me, load } = useConsole()
const { t, locale } = useI18n()

await load()
if (!me.value) await navigateTo('/login')

interface Row {
  bot: { id: string; name: string; slug: string; color: string; profile: string }
  job: any
}

const groups = ref<any[]>([])
const loading = ref(true)

async function fetchCrons() {
  loading.value = true
  try {
    groups.value = await $fetch<any[]>('/api/crons')
  } finally {
    loading.value = false
  }
}
onMounted(fetchCrons)

const rows = computed<Row[]>(() => {
  const all: Row[] = []
  for (const g of groups.value) for (const job of g.jobs) all.push({ bot: g.bot, job })
  // Paused jobs have no next run; they belong at the end, not at the front
  // where a missing date would sort them.
  return all.sort((a, b) => {
    const ta = a.job.nextRunAt ? Date.parse(a.job.nextRunAt) : Infinity
    const tb = b.job.nextRunAt ? Date.parse(b.job.nextRunAt) : Infinity
    return ta - tb
  })
})

const failing = computed(() => groups.value.filter(g => g.error))

/** "in 18 h", "in 3 min" — the form the question is actually asked in. */
function relative(iso: string | null) {
  if (!iso) return null
  const diff = Date.parse(iso) - Date.now()
  if (Number.isNaN(diff)) return null
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86400000], ['hour', 3600000], ['minute', 60000],
  ]
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit)
  }
  return rtf.format(Math.round(diff / 1000), 'second')
}

function absolute(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleString(locale.value, {
    weekday: 'short', hour: '2-digit', minute: '2-digit',
    day: '2-digit', month: '2-digit',
  })
}

const open = ref<string | null>(null)
</script>

<template>
  <div class="flex h-screen">
    <Sidebar />

    <main class="flex-1 overflow-y-auto scroller">
      <AppHeader>
        <h1 class="font-mono text-sm tracking-[.2em] uppercase text-cyan">{{ t('crons.title') }}</h1>
        <span class="meta">{{ t('crons.subtitle') }}</span>
        <button class="btn ml-auto" :disabled="loading" @click="fetchCrons">
          {{ t('crons.refresh') }}
        </button>
      </AppHeader>

      <div class="p-4 lg:p-6 max-w-4xl space-y-4">
        <p v-if="loading" class="meta">{{ t('common.loading') }}</p>

        <!-- A profile that did not answer is stated, not hidden. -->
        <div v-for="g in failing" :key="g.bot.id"
             class="panel panel-clip p-3 border-rose/40 bg-rose/5">
          <span class="text-sm text-rose">
            {{ g.bot.name }} — {{ t('crons.unreachable', { reason: g.error }) }}
          </span>
        </div>

        <p v-if="!loading && !rows.length" class="meta">{{ t('crons.none') }}</p>

        <article v-for="row in rows" :key="row.bot.id + row.job.id"
                 class="panel panel-clip bracket p-4">
          <div class="flex items-baseline gap-2 flex-wrap">
            <span class="w-1.5 h-1.5 shrink-0"
                  :style="{ background: row.bot.color, boxShadow: `0 0 8px ${row.bot.color}` }" />
            <h2 class="text-sm">{{ row.job.name }}</h2>
            <span class="meta">{{ row.bot.name }}</span>
            <code class="meta">{{ row.job.id }}</code>

            <span v-if="!row.job.enabled || row.job.state === 'paused'"
                  class="meta text-amber ml-auto">{{ t('crons.paused') }}</span>
            <span v-else-if="row.job.failureStreak > 0" class="meta text-rose ml-auto">
              {{ t('crons.failures', { count: row.job.failureStreak }) }}
            </span>
            <span v-else class="meta ml-auto text-lime">{{ t('crons.ok') }}</span>
          </div>

          <dl class="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div class="flex gap-2">
              <dt class="meta w-24 shrink-0">{{ t('crons.schedule') }}</dt>
              <dd class="font-mono text-xs">{{ row.job.schedule }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="meta w-24 shrink-0">{{ t('crons.next') }}</dt>
              <dd>
                <template v-if="row.job.nextRunAt">
                  {{ relative(row.job.nextRunAt) }}
                  <span class="meta">· {{ absolute(row.job.nextRunAt) }}</span>
                </template>
                <span v-else class="meta">—</span>
              </dd>
            </div>
            <div class="flex gap-2">
              <dt class="meta w-24 shrink-0">{{ t('crons.last') }}</dt>
              <dd>
                <template v-if="row.job.lastRunAt">
                  <span :class="row.job.lastStatus === 'ok' ? 'text-lime' : 'text-rose'">
                    {{ row.job.lastStatus || '?' }}
                  </span>
                  <span class="meta">· {{ absolute(row.job.lastRunAt) }}</span>
                </template>
                <span v-else class="meta">{{ t('crons.never') }}</span>
              </dd>
            </div>
            <div v-if="row.job.deliver" class="flex gap-2">
              <dt class="meta w-24 shrink-0">{{ t('crons.delivery') }}</dt>
              <dd class="font-mono text-xs">{{ row.job.deliver }}</dd>
            </div>
            <div v-if="row.job.script" class="flex gap-2">
              <dt class="meta w-24 shrink-0">{{ t('crons.script') }}</dt>
              <dd class="font-mono text-xs">
                {{ row.job.script }}
                <span v-if="row.job.noAgent" class="meta">({{ t('crons.scriptOnly') }})</span>
              </dd>
            </div>
            <div v-if="row.job.skills?.length" class="flex gap-2">
              <dt class="meta w-24 shrink-0">{{ t('crons.skills') }}</dt>
              <dd class="font-mono text-xs">{{ row.job.skills.join(', ') }}</dd>
            </div>
            <div v-if="row.job.model" class="flex gap-2">
              <dt class="meta w-24 shrink-0">{{ t('crons.model') }}</dt>
              <dd class="meta">{{ row.job.model }}</dd>
            </div>
            <div v-if="row.job.repeat?.completed" class="flex gap-2">
              <dt class="meta w-24 shrink-0">&nbsp;</dt>
              <dd class="meta">{{ t('crons.runs', { count: row.job.repeat.completed }) }}</dd>
            </div>
          </dl>

          <p v-if="row.job.lastError" class="mt-2 text-sm text-rose">{{ row.job.lastError }}</p>
          <p v-if="row.job.pausedReason" class="mt-2 text-sm text-amber">{{ row.job.pausedReason }}</p>

          <div v-if="row.job.prompt" class="mt-3">
            <button class="btn"
                    @click="open = open === row.bot.id + row.job.id ? null : row.bot.id + row.job.id">
              {{ open === row.bot.id + row.job.id ? t('crons.hidePrompt') : t('crons.showPrompt') }}
            </button>
            <pre v-if="open === row.bot.id + row.job.id"
                 class="answer font-mono text-xs mt-2 p-3 bg-void border border-edge">{{ row.job.prompt }}</pre>
          </div>
        </article>
      </div>
    </main>
  </div>
</template>
