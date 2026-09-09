<script setup lang="ts">
const route = useRoute()
const { ich, kanaele, bots, laden, botName, botFarbe, nutzerName } = useHermesUi()

if (!ich.value) await laden()
if (!ich.value) await navigateTo('/login')

const kanalId = computed(() => String(route.params.id))
const kanal = computed(() => kanaele.value.find(k => k.id === kanalId.value))
const nachrichten = ref<any[]>([])
const eingabe = ref('')
const faden = ref<string | null>(null)
const fehler = ref('')
const unten = ref<HTMLElement | null>(null)

async function holen() {
  try {
    nachrichten.value = await $fetch<any[]>(`/api/channels/${kanalId.value}/messages`)
  } catch (e: any) {
    fehler.value = e?.data?.statusMessage || 'Kanal nicht lesbar'
  }
}

async function senden() {
  const text = eingabe.value.trim()
  if (!text) return
  eingabe.value = ''
  await $fetch(`/api/channels/${kanalId.value}/messages`, {
    method: 'POST', body: { body: text, faden: faden.value },
  })
  await holen()
  nachRuntenScrollen()
}

function nachRuntenScrollen() {
  nextTick(() => unten.value?.scrollIntoView({ behavior: 'smooth' }))
}

/**
 * Nachfragen statt WebSocket: ein Agentenlauf dauert bis zu zwei Minuten, und
 * solange steht die Antwort auf `pending`. Alle zwei Sekunden nachsehen ist
 * für vier Bots und eine Handvoll Menschen völlig ausreichend — ein
 * WebSocket-Kanal wäre hier Aufwand ohne Gewinn.
 */
let takt: any = null
onMounted(async () => {
  await holen(); nachRuntenScrollen()
  takt = setInterval(async () => {
    const offen = nachrichten.value.some(n => n.state === 'pending')
    await holen()
    if (offen) nachRuntenScrollen()
  }, 2000)
})
onUnmounted(() => clearInterval(takt))
watch(kanalId, async () => { faden.value = null; await holen(); nachRuntenScrollen() })

const sichtbar = computed(() =>
  nachrichten.value.filter(n => (faden.value ? n.threadRootId === faden.value || n.id === faden.value : !n.threadRootId)))

const botsImKanal = computed(() =>
  (kanal.value?.mitglieder ?? []).filter((m: any) => m.kind === 'bot')
    .map((m: any) => bots.value.find(b => b.id === m.refId)).filter(Boolean))

async function einladen(botId: string) {
  await $fetch(`/api/channels/${kanalId.value}/members`, {
    method: 'POST', body: { kind: 'bot', refId: botId },
  })
  await laden(); await holen()
}

const uhr = (t: number) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div class="h-screen flex">
    <Seitenleiste />

    <main class="flex-1 flex flex-col min-w-0">
      <header class="px-5 py-3 border-b border-rand flex items-center gap-3">
        <div class="min-w-0">
          <div class="font-medium truncate">
            {{ kanal?.kind === 'dm' ? kanal?.name : `# ${kanal?.name ?? '…'}` }}
          </div>
          <div class="text-xs text-leise truncate">{{ kanal?.topic }}</div>
        </div>
        <div class="ml-auto flex items-center gap-2">
          <span v-for="b in botsImKanal" :key="b.id"
                class="text-xs px-2 py-0.5 rounded-full border border-rand"
                :style="{ color: b.color }">@{{ b.slug }}</span>
          <select v-if="kanal?.kind === 'channel'" class="bg-grund border border-rand rounded text-xs px-2 py-1"
                  @change="einladen(($event.target as HTMLSelectElement).value)">
            <option value="">Bot einladen…</option>
            <option v-for="b in bots" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>
      </header>

      <div v-if="faden" class="px-5 py-2 bg-flaeche border-b border-rand text-xs flex items-center gap-3">
        <span class="text-leise">Faden</span>
        <button class="text-akzent" @click="faden = null">zurück zum Kanal</button>
      </div>

      <div class="flex-1 overflow-y-auto verlauf px-5 py-4 space-y-3">
        <p v-if="fehler" class="text-red-400 text-sm">{{ fehler }}</p>

        <article v-for="n in sichtbar" :key="n.id" class="flex gap-3 group">
          <div class="w-8 h-8 rounded shrink-0 grid place-items-center text-xs font-medium"
               :style="{ background: n.authorKind === 'bot' ? botFarbe(n.authorId) : '#2f3542',
                         color: n.authorKind === 'bot' ? '#14161c' : '#e6e8ee' }">
            {{ (n.authorKind === 'bot' ? botName(n.authorId) : nutzerName(n.authorId)).slice(0, 2) }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
              <span class="text-sm font-medium">
                {{ n.authorKind === 'bot' ? botName(n.authorId) : nutzerName(n.authorId) }}
              </span>
              <span v-if="n.authorKind === 'bot'" class="text-[10px] uppercase text-leise border border-rand rounded px-1">Bot</span>
              <span class="text-xs text-leise">{{ uhr(n.createdAt) }}</span>
              <button v-if="!faden" class="text-xs text-leise opacity-0 group-hover:opacity-100 ml-2"
                      @click="faden = n.id">Faden</button>
            </div>
            <p v-if="n.state === 'pending'" class="text-leise text-sm italic">denkt nach …</p>
            <p v-else class="text-sm whitespace-pre-wrap break-words"
               :class="n.state === 'error' ? 'text-red-400' : n.authorKind === 'system' ? 'text-leise italic' : ''">{{ n.body }}</p>
          </div>
        </article>
        <div ref="unten" />
      </div>

      <form class="p-4 border-t border-rand" @submit.prevent="senden">
        <input v-model="eingabe"
               :placeholder="kanal?.kind === 'dm' ? 'Nachricht schreiben…' : 'Nachricht — Bot mit @kürzel ansprechen'"
               class="w-full bg-flaeche border border-rand rounded-lg px-4 py-3 text-sm" />
      </form>
    </main>
  </div>
</template>
