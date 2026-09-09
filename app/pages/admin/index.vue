<script setup lang="ts">
const { me, users, bots, load, isAdmin } = useConsole()
const { t } = useI18n()

await load()
if (!me.value) await navigateTo('/login')
else if (!isAdmin.value) await navigateTo('/')

// ── People ───────────────────────────────────────────────────────────────
const invites = ref<any[]>([])
const inviteEmail = ref('')
const inviteRole = ref<'member' | 'admin'>('member')
const freshLink = ref('')
const copied = ref(false)

async function loadInvites() {
  invites.value = await $fetch<any[]>('/api/invites')
}
async function createInvite() {
  const r = await $fetch<any>('/api/invites', {
    method: 'POST', body: { email: inviteEmail.value || undefined, role: inviteRole.value },
  })
  freshLink.value = r.url
  inviteEmail.value = ''
  copied.value = false
  await loadInvites()
}
async function revoke(id: string) {
  await $fetch('/api/invites', { method: 'DELETE', body: { inviteId: id } })
  await loadInvites()
}
async function copyLink() {
  await navigator.clipboard.writeText(freshLink.value)
  copied.value = true
}

// ── Bots ─────────────────────────────────────────────────────────────────
const tokens = reactive<Record<string, any[]>>({})
const freshKey = ref('')

async function loadTokens(botId: string) {
  tokens[botId] = await $fetch<any[]>(`/api/bots/${botId}/tokens`)
}
async function issueKey(botId: string) {
  const r = await $fetch<any>(`/api/bots/${botId}/tokens`, {
    method: 'POST', body: { label: 'cron' },
  })
  freshKey.value = r.token
  await loadTokens(botId)
}
async function revokeKey(botId: string, tokenId: string) {
  await $fetch(`/api/bots/${botId}/tokens`, { method: 'DELETE', body: { tokenId } })
  await loadTokens(botId)
}
async function toggleActive(bot: any) {
  await $fetch(`/api/bots/${bot.id}`, { method: 'PATCH', body: { active: !bot.active } })
  await load()
}
async function toggleOperator(bot: any) {
  await $fetch(`/api/bots/${bot.id}`, { method: 'PATCH', body: { operator: !bot.operator } })
  await load()
}
async function removeBot(bot: any) {
  if (!confirm(t('admin.confirmRemove', { name: bot.name }))) return
  await $fetch(`/api/bots/${bot.id}`, { method: 'DELETE' })
  await load()
}

const expanded = ref<string | null>(null)
async function expand(botId: string) {
  expanded.value = expanded.value === botId ? null : botId
  if (expanded.value && !tokens[botId]) await loadTokens(botId)
}

function when(ts?: number | null) {
  return ts ? new Date(ts).toLocaleString() : t('admin.never')
}

onMounted(loadInvites)
</script>

<template>
  <div class="flex h-screen">
    <Sidebar />

    <main class="flex-1 overflow-y-auto scroller">
      <header class="px-6 py-4 border-b border-edge panel flex items-center gap-3">
        <h1 class="font-mono text-sm tracking-[.2em] uppercase text-cyan">{{ t('admin.title') }}</h1>
        <NuxtLink to="/" class="btn ml-auto">{{ t('nav.backToChat') }}</NuxtLink>
      </header>

      <div class="p-6 space-y-8 max-w-4xl">
        <!-- Notifications ------------------------------------------------ -->
        <section class="panel panel-clip bracket p-5">
          <h2 class="label mb-3">{{ t('push.title') }}</h2>
          <PushToggle />
        </section>

        <!-- People ------------------------------------------------------- -->
        <section class="panel panel-clip bracket p-5">
          <h2 class="label">{{ t('admin.people') }}</h2>
          <p class="text-sm text-muted mt-1 mb-4">{{ t('admin.peopleHint') }}</p>

          <ul class="divide-y divide-edge mb-5">
            <li v-for="u in users" :key="u.id" class="py-2 flex items-center gap-3 text-sm">
              <span class="w-1.5 h-1.5 bg-muted" />
              <span>{{ u.name }}</span>
              <span class="meta">{{ u.email }}</span>
              <span class="meta ml-auto"
                    :class="u.role === 'admin' ? 'text-amber' : ''">{{ u.role }}</span>
            </li>
          </ul>

          <form class="flex flex-wrap items-end gap-2" @submit.prevent="createInvite">
            <label class="flex-1 min-w-52">
              <span class="label">{{ t('admin.inviteEmail') }}</span>
              <input v-model="inviteEmail" type="email" class="field mt-1" />
            </label>
            <label>
              <span class="label">{{ t('admin.role') }}</span>
              <select v-model="inviteRole" class="field mt-1">
                <option value="member">{{ t('admin.roleMember') }}</option>
                <option value="admin">{{ t('admin.roleAdmin') }}</option>
              </select>
            </label>
            <button class="btn btn-primary">{{ t('admin.invite') }}</button>
          </form>

          <div v-if="freshLink" class="mt-4 p-3 border border-cyan/40 bg-cyan/5">
            <p class="text-sm text-cyan mb-2">{{ t('admin.inviteCreated') }}</p>
            <div class="flex gap-2">
              <input :value="freshLink" readonly class="field font-mono text-xs" />
              <button class="btn" @click="copyLink">
                {{ copied ? t('admin.copied') : t('admin.copy') }}
              </button>
            </div>
          </div>

          <div v-if="invites.length" class="mt-5">
            <h3 class="label mb-2">{{ t('admin.pending') }}</h3>
            <ul class="space-y-1">
              <li v-for="i in invites" :key="i.id" class="flex items-center gap-3 text-sm">
                <span class="meta">{{ i.email || '—' }}</span>
                <span class="meta">{{ i.role }}</span>
                <span class="meta">{{ t('admin.expires', { when: new Date(i.expiresAt).toLocaleDateString() }) }}</span>
                <button class="btn btn-danger ml-auto" @click="revoke(i.id)">{{ t('admin.revoke') }}</button>
              </li>
            </ul>
          </div>
        </section>

        <!-- Bots --------------------------------------------------------- -->
        <section class="panel panel-clip bracket p-5">
          <div class="flex items-start gap-3">
            <div>
              <h2 class="label">{{ t('admin.bots') }}</h2>
              <p class="text-sm text-muted mt-1">{{ t('admin.botsHint') }}</p>
            </div>
            <NuxtLink to="/admin/bots/new" class="btn btn-primary ml-auto shrink-0">
              {{ t('admin.newBot') }}
            </NuxtLink>
          </div>

          <ul class="divide-y divide-edge mt-4">
            <li v-for="b in bots" :key="b.id" class="py-3">
              <div class="flex items-center gap-3 text-sm">
                <span class="w-1.5 h-1.5 shrink-0"
                      :style="{ background: b.color, boxShadow: `0 0 8px ${b.color}` }" />
                <button class="text-left hover:text-cyan transition-colors" @click="expand(b.id)">
                  {{ b.name }}
                </button>
                <span class="meta">@{{ b.slug }}</span>
                <span class="meta">{{ b.profile }}</span>
                <span v-if="b.operator" class="meta text-amber">operator</span>
                <span v-if="!b.active" class="meta text-rose">off</span>
                <div class="ml-auto flex gap-2">
                  <button class="btn" @click="toggleActive(b)">
                    {{ b.active ? t('admin.deactivate') : t('admin.activate') }}
                  </button>
                  <button class="btn btn-danger" @click="removeBot(b)">{{ t('admin.remove') }}</button>
                </div>
              </div>

              <div v-if="expanded === b.id" class="mt-3 ml-4 pl-4 border-l border-edge space-y-3">
                <p class="meta">{{ b.apiBase }} · {{ t('bot.model') }}: {{ b.model || 'hermes-agent' }}</p>
                <p v-if="b.description" class="text-sm text-muted">{{ b.description }}</p>

                <label class="flex items-center gap-2 text-sm">
                  <input type="checkbox" :checked="!!b.operator" @change="toggleOperator(b)" />
                  <span>{{ t('admin.operator') }}</span>
                </label>
                <p class="meta">{{ t('admin.operatorHint') }}</p>

                <div>
                  <h4 class="label mb-1">{{ t('admin.keys') }}</h4>
                  <p class="meta mb-2">{{ t('admin.keysHint') }}</p>
                  <ul class="space-y-1 mb-2">
                    <li v-for="k in tokens[b.id] || []" :key="k.id"
                        class="flex items-center gap-3 text-sm">
                      <span class="font-mono text-xs">{{ k.prefix }}…</span>
                      <span class="meta">{{ k.label }}</span>
                      <span class="meta">{{ t('admin.lastUsed', { when: when(k.lastUsedAt) }) }}</span>
                      <button class="btn btn-danger ml-auto" @click="revokeKey(b.id, k.id)">
                        {{ t('admin.revoke') }}
                      </button>
                    </li>
                  </ul>
                  <button class="btn" @click="issueKey(b.id)">{{ t('admin.newKey') }}</button>
                </div>
              </div>
            </li>
          </ul>

          <div v-if="freshKey" class="mt-4 p-3 border border-amber/40 bg-amber/5">
            <p class="text-sm text-amber mb-2">{{ t('admin.keyCreated') }}</p>
            <input :value="freshKey" readonly class="field font-mono text-xs" />
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
