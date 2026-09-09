<script setup lang="ts">
const { ich, kanaele, bots, laden } = useHermesUi()
const route = useRoute()
const neuerKanal = ref('')

async function kanalAnlegen() {
  if (!neuerKanal.value.trim()) return
  const k = await $fetch<any>('/api/channels', { method: 'POST', body: { name: neuerKanal.value.trim() } })
  neuerKanal.value = ''
  await laden()
  await navigateTo(`/c/${k.id}`)
}

/** Direktnachricht öffnen — der Endpunkt gibt eine bestehende zurück, falls es sie gibt. */
async function dmOeffnen(botId: string) {
  const k = await $fetch<any>('/api/channels', { method: 'POST', body: { kind: 'dm', botId } })
  await laden()
  await navigateTo(`/c/${k.id}`)
}

async function abmelden() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}

const raeume = computed(() => kanaele.value.filter(k => k.kind === 'channel'))
const dms = computed(() => kanaele.value.filter(k => k.kind === 'dm'))
</script>

<template>
  <aside class="w-64 shrink-0 bg-seite border-r border-rand flex flex-col">
    <div class="px-4 py-3 border-b border-rand">
      <div class="font-medium">Hermes</div>
      <div class="text-xs text-leise">{{ ich?.name }}</div>
    </div>

    <div class="flex-1 overflow-y-auto verlauf px-2 py-3 space-y-4">
      <section>
        <h2 class="px-2 text-xs uppercase tracking-wide text-leise mb-1">Kanäle</h2>
        <NuxtLink v-for="k in raeume" :key="k.id" :to="`/c/${k.id}`"
          class="block px-2 py-1 rounded text-sm hover:bg-flaeche"
          :class="route.params.id === k.id ? 'bg-flaeche text-akzent' : ''">
          # {{ k.name }}
        </NuxtLink>
        <form class="mt-2 px-2" @submit.prevent="kanalAnlegen">
          <input v-model="neuerKanal" placeholder="+ neuer Kanal"
                 class="w-full bg-grund border border-rand rounded px-2 py-1 text-sm" />
        </form>
      </section>

      <section v-if="dms.length">
        <h2 class="px-2 text-xs uppercase tracking-wide text-leise mb-1">Direktnachrichten</h2>
        <NuxtLink v-for="k in dms" :key="k.id" :to="`/c/${k.id}`"
          class="block px-2 py-1 rounded text-sm hover:bg-flaeche"
          :class="route.params.id === k.id ? 'bg-flaeche text-akzent' : ''">
          {{ k.name }}
        </NuxtLink>
      </section>

      <section>
        <h2 class="px-2 text-xs uppercase tracking-wide text-leise mb-1">Bots</h2>
        <button v-for="b in bots" :key="b.id" @click="dmOeffnen(b.id)"
          class="w-full text-left px-2 py-1 rounded text-sm hover:bg-flaeche flex items-center gap-2">
          <span class="w-2 h-2 rounded-full" :style="{ background: b.color }" />
          {{ b.name }}
          <span class="text-leise text-xs">@{{ b.slug }}</span>
        </button>
        <p v-if="!bots.length" class="px-2 text-xs text-leise">
          Noch keiner verdrahtet.
        </p>
      </section>
    </div>

    <button class="text-xs text-leise hover:text-text px-4 py-3 border-t border-rand text-left"
            @click="abmelden">Abmelden</button>
  </aside>
</template>
