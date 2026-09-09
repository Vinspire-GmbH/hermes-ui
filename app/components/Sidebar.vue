<script setup lang="ts">
const { me, channels, bots, load, isAdmin } = useConsole()
const { t } = useI18n()
const { open } = useNav()
const route = useRoute()
const newChannel = ref('')

async function createChannel() {
  const name = newChannel.value.trim()
  if (!name) return
  const c = await $fetch<any>('/api/channels', { method: 'POST', body: { name } })
  newChannel.value = ''
  await load()
  await navigateTo(`/c/${c.id}`)
}

/** Open a direct message — the endpoint returns the existing one if there is one. */
async function openDm(botId: string) {
  const c = await $fetch<any>('/api/channels', { method: 'POST', body: { kind: 'dm', botId } })
  await load()
  await navigateTo(`/c/${c.id}`)
}

async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}

const rooms = computed(() => channels.value.filter(c => c.kind === 'channel'))
const dms = computed(() => channels.value.filter(c => c.kind === 'dm'))
</script>

<template>
  <!-- Below `lg` the sidebar is a drawer over the content; from `lg` up it is
       simply a column. One element, two behaviours, no duplicated markup. -->
  <div
    v-if="open"
    class="lg:hidden fixed inset-0 z-30 bg-void/70 backdrop-blur-sm"
    @click="open = false" />
  <aside
    class="w-64 shrink-0 panel border-r border-edge flex flex-col
           fixed inset-y-0 left-0 z-40 transition-transform duration-200
           lg:static lg:z-auto lg:translate-x-0"
    :class="open ? 'translate-x-0' : '-translate-x-full'">
    <div class="px-4 py-4 border-b border-edge">
      <div class="flex items-center gap-2">
        <span class="w-1.5 h-1.5 bg-cyan shadow-[0_0_10px_#22d3ee]" />
        <span class="font-mono text-sm tracking-[.2em] text-cyan uppercase">{{ t('app.name') }}</span>
        <button
          class="lg:hidden ml-auto text-faint hover:text-cyan transition-colors"
          aria-label="Close"
          @click="open = false">✕</button>
      </div>
      <div class="meta mt-1">{{ me?.name }}</div>
    </div>

    <nav class="flex-1 overflow-y-auto scroller px-2 py-4 space-y-5">
      <section>
        <h2 class="label px-2 mb-1.5">{{ t('nav.channels') }}</h2>
        <NuxtLink
          v-for="c in rooms" :key="c.id" :to="`/c/${c.id}`"
          class="block px-2 py-1.5 text-sm hover:bg-raised transition-colors"
          :class="route.params.id === c.id ? 'row-active' : 'text-muted'">
          <span class="text-faint">#</span> {{ c.name }}
          <span v-if="c.unread && route.params.id !== c.id"
                class="float-right font-mono text-[10px] px-1.5 bg-cyan text-void">
            {{ c.unread > 99 ? '99+' : c.unread }}
          </span>
        </NuxtLink>
        <form class="mt-2 px-2" @submit.prevent="createChannel">
          <input v-model="newChannel" :placeholder="t('nav.newChannel')" class="field text-xs" />
        </form>
      </section>

      <section v-if="dms.length">
        <h2 class="label px-2 mb-1.5">{{ t('nav.directMessages') }}</h2>
        <NuxtLink
          v-for="c in dms" :key="c.id" :to="`/c/${c.id}`"
          class="block px-2 py-1.5 text-sm hover:bg-raised transition-colors"
          :class="route.params.id === c.id ? 'row-active' : 'text-muted'">
          {{ c.name }}
          <span v-if="c.unread && route.params.id !== c.id"
                class="float-right font-mono text-[10px] px-1.5 bg-cyan text-void">
            {{ c.unread > 99 ? '99+' : c.unread }}
          </span>
        </NuxtLink>
      </section>

      <section>
        <h2 class="label px-2 mb-1.5">{{ t('nav.bots') }}</h2>
        <button
          v-for="b in bots" :key="b.id"
          class="w-full text-left px-2 py-1.5 text-sm hover:bg-raised flex items-center gap-2 transition-colors"
          :class="b.active ? 'text-muted' : 'text-faint line-through'"
          @click="openDm(b.id)">
          <span class="w-1.5 h-1.5 shrink-0" :style="{ background: b.color, boxShadow: `0 0 8px ${b.color}` }" />
          <span class="truncate">{{ b.name }}</span>
          <span class="meta ml-auto">@{{ b.slug }}</span>
        </button>
        <p v-if="!bots.length" class="px-2 meta">{{ t('nav.noBots') }}</p>
      </section>
    </nav>

    <div class="border-t border-edge p-2 space-y-1">
      <NuxtLink to="/crons"
        class="block px-2 py-1.5 text-xs font-mono uppercase tracking-wider text-muted hover:text-cyan transition-colors">
        {{ t('nav.schedule') }}
      </NuxtLink>
      <NuxtLink to="/usage"
        class="block px-2 py-1.5 text-xs font-mono uppercase tracking-wider text-muted hover:text-cyan transition-colors">
        {{ t('nav.usage') }}
      </NuxtLink>
      <NuxtLink v-if="isAdmin" to="/admin"
        class="block px-2 py-1.5 text-xs font-mono uppercase tracking-wider text-muted hover:text-cyan transition-colors">
        {{ t('nav.admin') }}
      </NuxtLink>
      <LanguageSwitch />
      <button
        class="block w-full text-left px-2 py-1.5 text-xs font-mono uppercase tracking-wider text-faint hover:text-rose transition-colors"
        @click="signOut">
        {{ t('nav.signOut') }}
      </button>
    </div>
  </aside>
</template>
