<script setup lang="ts">
/**
 * Four steps to a bot: who it is, what it should be like, where it lives, done.
 *
 * The order matters. The persona comes before the connection because the
 * interview is the part that takes thought — and if it turns out you do not
 * want this bot after all, nothing has been created anywhere.
 */
const { me, bots, load, isAdmin } = useConsole()
const { t, locale } = useI18n()

await load()
if (!me.value) await navigateTo('/login')
else if (!isAdmin.value) await navigateTo('/')

const step = ref(1)
const TOTAL = 4

// ── Step 1: identity ─────────────────────────────────────────────────────
const form = reactive({
  name: '',
  slug: '',
  role: '',
  colour: '#22d3ee',
  profile: '',
  apiBase: '',
  apiKey: '',
  model: '',
  description: '',
})
watch(() => form.name, (n) => {
  if (!form.slug) form.slug = n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!form.profile) form.profile = form.slug
})

const PALETTE = ['#22d3ee', '#e879f9', '#a3e635', '#fbbf24', '#fb7185', '#818cf8']

// ── Step 2: the interview ────────────────────────────────────────────────
const architect = ref('')
const session = ref<string | null>(null)
const question = ref('')
const answer = ref('')
const transcript = ref<{ q: string; a: string }[]>([])
const soul = ref('')
const thinking = ref(false)
const interviewError = ref('')

const usableBots = computed(() => bots.value.filter(b => b.active))

async function turn(body: Record<string, unknown>) {
  thinking.value = true
  interviewError.value = ''
  try {
    const r = await $fetch<any>('/api/soul/interview', {
      method: 'POST',
      body: { architectBotId: architect.value, language: locale.value, ...body },
    })
    session.value = r.session
    if (r.soul) { soul.value = r.soul; question.value = '' } else { question.value = r.question }
  } catch (e: any) {
    interviewError.value = e?.data?.statusMessage || e?.statusMessage || t('common.error')
  } finally {
    thinking.value = false
  }
}

const startInterview = () => turn({ name: form.name, role: form.role })
async function answerQuestion() {
  const a = answer.value.trim()
  if (!a) return
  transcript.value.push({ q: question.value, a })
  answer.value = ''
  await turn({ session: session.value, answer: a })
}
const finishNow = () => turn({ session: session.value, finish: true })
function restart() {
  session.value = null; question.value = ''; transcript.value = []; soul.value = ''
}

function downloadSoul() {
  const blob = new Blob([soul.value], { type: 'text/markdown' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'SOUL.md'
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── Step 3: the connection ───────────────────────────────────────────────
const test = ref<{ ok: boolean; models?: string[]; reason?: string } | null>(null)
const testing = ref(false)
async function testConnection() {
  testing.value = true
  try {
    test.value = await $fetch('/api/bots/test', {
      method: 'POST', body: { apiBase: form.apiBase, apiKey: form.apiKey },
    })
    if (test.value?.ok && !form.model && test.value.models?.length) {
      form.model = test.value.models.find(m => m === form.profile) || test.value.models[0]
    }
  } finally {
    testing.value = false
  }
}

const operatorBot = computed(() => bots.value.find(b => b.operator))
const applying = ref(false)
const applied = ref<any>(null)
const applyError = ref('')

/** Have the operator bot create the profile and write the SOUL. */
async function applyToHermes() {
  applying.value = true
  applyError.value = ''
  try {
    applied.value = await $fetch('/api/soul/apply', {
      method: 'POST',
      body: {
        profile: form.profile,
        soul: soul.value,
        description: form.description || form.role,
        operatorBotId: operatorBot.value?.id,
      },
    })
    // The operator reports the address and key it set up; fill them in so the
    // last step is one click rather than a copy exercise.
    if (applied.value?.port && !form.apiBase) {
      form.apiBase = `http://localhost:${applied.value.port}`
    }
    if (applied.value?.apiKey) form.apiKey = applied.value.apiKey
    if (!form.model) form.model = form.profile
  } catch (e: any) {
    applyError.value = e?.data?.statusMessage || e?.statusMessage || t('common.error')
  } finally {
    applying.value = false
  }
}

// ── Step 4: save ─────────────────────────────────────────────────────────
const saving = ref(false)
const saveError = ref('')
async function save() {
  saving.value = true
  saveError.value = ''
  try {
    await $fetch('/api/bots', {
      method: 'POST',
      body: {
        name: form.name, slug: form.slug, profile: form.profile,
        apiBase: form.apiBase, apiKey: form.apiKey, model: form.model || form.profile,
        color: form.colour, description: form.description || form.role,
      },
    })
    await load()
    await navigateTo('/admin')
  } catch (e: any) {
    saveError.value = e?.data?.statusMessage || e?.statusMessage || t('common.error')
  } finally {
    saving.value = false
  }
}

const canLeaveOne = computed(() => form.name.trim().length > 1 && form.slug.trim().length > 1)
</script>

<template>
  <div class="flex h-screen">
    <Sidebar />

    <main class="flex-1 overflow-y-auto scroller">
      <AppHeader>
        <h1 class="font-mono text-sm tracking-[.2em] uppercase text-cyan">{{ t('admin.newBot') }}</h1>
        <span class="label ml-auto">{{ t('soul.step', { n: step, total: TOTAL }) }}</span>
        <NuxtLink to="/admin" class="btn">{{ t('common.cancel') }}</NuxtLink>
      </AppHeader>

      <!-- Progress rail: four segments, lit as far as you have come. -->
      <div class="flex gap-1 px-4 lg:px-6 pt-4">
        <span v-for="n in TOTAL" :key="n" class="h-0.5 flex-1"
              :class="n <= step ? 'bg-cyan shadow-[0_0_8px_#22d3ee]' : 'bg-edge'" />
      </div>

      <div class="p-4 lg:p-6 max-w-3xl space-y-6">
        <!-- 1 · identity -->
        <section v-if="step === 1" class="panel panel-clip bracket p-5 space-y-4">
          <h2 class="label">{{ t('bot.identity') }}</h2>
          <div class="grid sm:grid-cols-2 gap-4">
            <label class="block">
              <span class="label">{{ t('auth.name') }}</span>
              <input v-model="form.name" class="field mt-1" placeholder="Erika" />
            </label>
            <label class="block">
              <span class="label">{{ t('bot.handle') }}</span>
              <input v-model="form.slug" class="field mt-1" placeholder="erika" />
              <span class="meta">{{ t('bot.handleHint') }}</span>
            </label>
          </div>
          <label class="block">
            <span class="label">{{ t('bot.description') }}</span>
            <input v-model="form.role" class="field mt-1"
                   placeholder="Sales: quotes, follow-ups, keeping the pipeline honest" />
          </label>
          <div>
            <span class="label">{{ t('bot.color') }}</span>
            <div class="flex gap-2 mt-2">
              <button v-for="c in PALETTE" :key="c" class="w-7 h-7 border transition-all"
                      :style="{ background: c, borderColor: form.colour === c ? '#e8f0f8' : 'transparent',
                                boxShadow: form.colour === c ? `0 0 12px ${c}` : 'none' }"
                      @click="form.colour = c" />
            </div>
          </div>
          <div class="flex justify-end pt-2">
            <button class="btn btn-primary" :disabled="!canLeaveOne" @click="step = 2">
              {{ t('soul.next') }}
            </button>
          </div>
        </section>

        <!-- 2 · the interview -->
        <section v-if="step === 2" class="panel panel-clip bracket p-5 space-y-4">
          <div>
            <h2 class="label">{{ t('soul.title') }}</h2>
            <p class="text-sm text-muted mt-1">{{ t('soul.subtitle') }}</p>
          </div>

          <label v-if="!session" class="block">
            <span class="label">{{ t('soul.architect') }}</span>
            <select v-model="architect" class="field mt-1">
              <option value="">—</option>
              <option v-for="b in usableBots" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
            <span class="meta">{{ t('soul.architectHint') }}</span>
          </label>

          <button v-if="!session" class="btn btn-primary" :disabled="!architect || thinking"
                  @click="startInterview">
            {{ thinking ? t('soul.generating') : t('soul.start') }}
          </button>

          <div v-if="transcript.length" class="space-y-3 max-h-72 overflow-y-auto scroller pr-2">
            <div v-for="(turn_, i) in transcript" :key="i">
              <p class="text-sm text-cyan">{{ turn_.q }}</p>
              <p class="text-sm text-muted pl-3 border-l border-edge mt-1">{{ turn_.a }}</p>
            </div>
          </div>

          <div v-if="thinking" class="flex items-center gap-1.5">
            <span class="pulse-dot" /><span class="pulse-dot" /><span class="pulse-dot" />
            <span class="meta ml-2">{{ t('chat.thinking') }}</span>
          </div>

          <div v-if="question && !thinking" class="space-y-2">
            <p class="text-sm text-cyan">{{ question }}</p>
            <form class="flex gap-2" @submit.prevent="answerQuestion">
              <input v-model="answer" class="field" :placeholder="t('soul.yourAnswer')" />
              <button class="btn btn-primary" :disabled="!answer.trim()">{{ t('soul.next') }}</button>
            </form>
            <button class="btn" @click="finishNow">{{ t('soul.generate') }}</button>
          </div>

          <p v-if="interviewError" class="text-sm text-rose">{{ interviewError }}</p>

          <div v-if="soul" class="space-y-2">
            <span class="label">{{ t('soul.draft') }}</span>
            <textarea v-model="soul" rows="16" class="field font-mono text-xs" />
            <div class="flex flex-wrap gap-2">
              <button class="btn" @click="downloadSoul">{{ t('soul.download') }}</button>
              <button class="btn" @click="restart">{{ t('soul.restart') }}</button>
            </div>
          </div>

          <div class="flex justify-between pt-2">
            <button class="btn" @click="step = 1">{{ t('soul.back') }}</button>
            <button class="btn btn-primary" @click="step = 3">{{ t('soul.next') }}</button>
          </div>
        </section>

        <!-- 3 · where it lives -->
        <section v-if="step === 3" class="panel panel-clip bracket p-5 space-y-4">
          <h2 class="label">{{ t('bot.connection') }}</h2>

          <div v-if="soul" class="p-3 border border-edge space-y-2">
            <p class="text-sm text-muted">{{ t('soul.applyHint') }}</p>
            <button class="btn btn-primary" :disabled="!operatorBot || applying" @click="applyToHermes">
              {{ applying ? t('soul.applying') : t('soul.apply') }}
            </button>
            <p v-if="!operatorBot" class="meta text-amber">{{ t('soul.applyNeedsOperator') }}</p>
            <p v-if="applyError" class="text-sm text-rose">{{ applyError }}</p>
            <div v-if="applied" class="space-y-1">
              <p class="text-sm text-lime">{{ t('soul.applied') }}</p>
              <pre class="answer meta whitespace-pre-wrap">{{ applied.report }}</pre>
              <p class="meta text-amber">{{ applied.note }}</p>
            </div>
          </div>

          <div class="grid sm:grid-cols-2 gap-4">
            <label class="block sm:col-span-2">
              <span class="label">{{ t('bot.apiBase') }}</span>
              <input v-model="form.apiBase" class="field mt-1" placeholder="http://hermes:9200" />
              <span class="meta">{{ t('bot.apiBaseHint') }}</span>
            </label>
            <label class="block">
              <span class="label">{{ t('bot.apiKey') }}</span>
              <input v-model="form.apiKey" type="password" class="field mt-1" />
              <span class="meta">{{ t('bot.apiKeyHint') }}</span>
            </label>
            <label class="block">
              <span class="label">{{ t('bot.profile') }}</span>
              <input v-model="form.profile" class="field mt-1" />
            </label>
            <label class="block sm:col-span-2">
              <span class="label">{{ t('bot.model') }}</span>
              <input v-model="form.model" class="field mt-1" :placeholder="form.profile" />
              <span class="meta">{{ t('bot.modelHint') }}</span>
            </label>
          </div>

          <div class="flex items-center gap-3">
            <button class="btn" :disabled="testing || !form.apiBase || !form.apiKey"
                    @click="testConnection">
              {{ testing ? t('bot.testing') : t('bot.test') }}
            </button>
            <p v-if="test?.ok" class="text-sm text-lime">
              {{ t('bot.reachable', { models: test.models?.join(', ') || '—' }) }}
            </p>
            <p v-else-if="test" class="text-sm text-rose">
              {{ t('bot.unreachable', { reason: test.reason || '' }) }}
            </p>
          </div>

          <div class="flex justify-between pt-2">
            <button class="btn" @click="step = 2">{{ t('soul.back') }}</button>
            <button class="btn btn-primary" @click="step = 4">{{ t('soul.next') }}</button>
          </div>
        </section>

        <!-- 4 · save -->
        <section v-if="step === 4" class="panel panel-clip bracket p-5 space-y-4">
          <h2 class="label">{{ t('bot.create') }}</h2>
          <dl class="text-sm space-y-1">
            <div class="flex gap-3"><dt class="meta w-28">{{ t('auth.name') }}</dt><dd>{{ form.name }}</dd></div>
            <div class="flex gap-3"><dt class="meta w-28">{{ t('bot.handle') }}</dt><dd>@{{ form.slug }}</dd></div>
            <div class="flex gap-3"><dt class="meta w-28">{{ t('bot.profile') }}</dt><dd>{{ form.profile }}</dd></div>
            <div class="flex gap-3"><dt class="meta w-28">{{ t('bot.apiBase') }}</dt><dd class="font-mono text-xs">{{ form.apiBase }}</dd></div>
            <div class="flex gap-3"><dt class="meta w-28">{{ t('bot.model') }}</dt><dd>{{ form.model || form.profile }}</dd></div>
            <div class="flex gap-3"><dt class="meta w-28">SOUL.md</dt><dd>{{ soul ? `${soul.split('\n').length} lines` : '—' }}</dd></div>
          </dl>
          <p v-if="saveError" class="text-sm text-rose">{{ saveError }}</p>
          <div class="flex justify-between pt-2">
            <button class="btn" @click="step = 3">{{ t('soul.back') }}</button>
            <button class="btn btn-primary" :disabled="saving" @click="save">
              {{ saving ? t('auth.working') : t('bot.create') }}
            </button>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
