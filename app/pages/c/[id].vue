<script setup lang="ts">
const { me, channels, bots, load, botName, botColor, userName } = useConsole()
const { t, locale } = useI18n()
const route = useRoute()

await load()
if (!me.value) await navigateTo('/login')

const channelId = computed(() => route.params.id as string)
const channel = computed(() => channels.value.find(c => c.id === channelId.value))
const isDm = computed(() => channel.value?.kind === 'dm')

const messages = ref<any[]>([])
const thread = ref<string | null>(null)
const draft = ref('')
const sending = ref(false)
const list = ref<HTMLElement | null>(null)

async function fetchMessages() {
  const query: Record<string, string> = {}
  if (thread.value) query.thread = thread.value
  try {
    messages.value = await $fetch<any[]>(`/api/channels/${channelId.value}/messages`, { query })
    await markRead()
  } catch {
    // A single failed poll is not worth a message on screen; the next one
    // is two seconds away.
  }
}

/**
 * Mark the channel read — but only while it is actually on screen.
 *
 * A window sitting behind others keeps polling, and counting those fetches as
 * reading would empty the unread badge for messages nobody has seen. So the
 * document has to be visible, and the mark only moves when there is something
 * new to move it past.
 */
async function markRead() {
  if (document.visibilityState !== 'visible') return
  const newest = messages.value.reduce((max, m) => Math.max(max, m.createdAt), 0)
  if (!newest || newest <= lastMarked) return
  lastMarked = newest
  try {
    await $fetch(`/api/channels/${channelId.value}/read`, {
      method: 'POST', body: { at: newest },
    })
    await load()
  } catch { /* the next poll tries again */ }
}
let lastMarked = 0

/** Call off a run that is still going. */
async function stop(messageId: string) {
  stopping.value = messageId
  try {
    await $fetch(`/api/channels/${channelId.value}/stop`, {
      method: 'POST', body: { messageId },
    })
    await fetchMessages()
  } catch (e: any) {
    alert(e?.data?.statusMessage || t('common.error'))
  } finally {
    stopping.value = ''
  }
}
const stopping = ref('')

/** What the run is up to, if the watcher has written anything. */
function progress(m: any) {
  if (!m.progress) return null
  try {
    return JSON.parse(m.progress) as {
      tool?: string | null; preview?: string | null; tools?: number; stopping?: boolean
    }
  } catch {
    return null
  }
}

async function send() {
  const body = draft.value.trim()
  if (!body || sending.value) return
  sending.value = true
  draft.value = ''
  try {
    await $fetch(`/api/channels/${channelId.value}/messages`, {
      method: 'POST',
      body: { body, thread: thread.value },
    })
    await fetchMessages()
    scrollDown()
  } catch (e: any) {
    draft.value = body
    alert(e?.data?.statusMessage || t('common.error'))
  } finally {
    sending.value = false
  }
}

function scrollDown() {
  nextTick(() => {
    if (list.value) list.value.scrollTop = list.value.scrollHeight
  })
}

/**
 * Two seconds of polling instead of a socket.
 *
 * The answer to a message arrives minutes later and through a different path
 * anyway (a run is collected in `messages.get`), so a socket would buy
 * latency nobody can perceive at the cost of a second delivery mechanism to
 * keep alive across restarts.
 */
let timer: any
onMounted(async () => {
  await fetchMessages()
  scrollDown()
  timer = setInterval(fetchMessages, 2000)
})
onUnmounted(() => clearInterval(timer))
watch([channelId, thread], async () => {
  lastMarked = 0
  messages.value = []
  await fetchMessages()
  scrollDown()
})

const visible = computed(() => thread.value
  ? messages.value
  : messages.value.filter(m => !m.threadRootId))

const inviteBot = ref('')
async function invite() {
  if (!inviteBot.value) return
  await $fetch(`/api/channels/${channelId.value}/members`, {
    method: 'POST', body: { kind: 'bot', refId: inviteBot.value },
  })
  inviteBot.value = ''
  await fetchMessages()
}

function author(m: any) {
  if (m.authorKind === 'bot') return botName(m.authorId)
  if (m.authorKind === 'system') return t('common.system')
  return m.authorId === me.value?.id ? t('common.you') : userName(m.authorId)
}
function colour(m: any) {
  if (m.authorKind === 'bot') return botColor(m.authorId)
  if (m.authorKind === 'system') return '#5b6d87'
  return '#8fa3bd'
}
function time(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="flex h-screen">
    <Sidebar />

    <main class="flex-1 flex flex-col min-w-0">
      <AppHeader>
        <h1 class="font-mono text-sm tracking-wider truncate">
          <span v-if="!isDm" class="text-faint">#</span>{{ channel?.name }}
        </h1>
        <span v-if="channel?.topic" class="meta truncate hidden sm:inline">{{ channel.topic }}</span>

        <div v-if="thread" class="ml-auto flex items-center gap-3">
          <span class="label text-cyan">{{ t('chat.thread') }}</span>
          <button class="btn" @click="thread = null">{{ t('chat.closeThread') }}</button>
        </div>
        <div v-else-if="!isDm" class="ml-auto flex items-center gap-2">
          <select v-model="inviteBot" class="field text-xs w-32 sm:w-40" @change="invite">
            <option value="">{{ t('chat.inviteBot') }}</option>
            <option v-for="b in bots" :key="b.id" :value="b.id">@{{ b.slug }}</option>
          </select>
        </div>
      </AppHeader>

      <div ref="list" class="flex-1 overflow-y-auto scroller px-4 lg:px-5 py-4 space-y-4">
        <p v-if="!visible.length" class="meta">{{ t('chat.empty') }}</p>

        <article v-for="m in visible" :key="m.id" class="group">
          <div class="flex items-baseline gap-2">
            <span class="w-1.5 h-1.5 shrink-0 translate-y-[-1px]"
                  :style="{ background: colour(m), boxShadow: `0 0 8px ${colour(m)}` }" />
            <span class="font-mono text-xs tracking-wide" :style="{ color: colour(m) }">
              {{ author(m) }}
            </span>
            <span class="meta">{{ time(m.createdAt) }}</span>
            <button v-if="!thread && m.authorKind !== 'system'"
                    class="meta ml-auto opacity-0 group-hover:opacity-100 hover:text-cyan transition-opacity"
                    @click="thread = m.threadRootId || m.id">
              {{ t('chat.reply') }}
            </button>
          </div>

          <div class="pl-[14px] mt-1">
            <div v-if="m.state === 'pending'" class="py-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="pulse-dot" /><span class="pulse-dot" /><span class="pulse-dot" />
                <span class="meta ml-2">
                  <template v-if="progress(m)?.stopping">{{ t('chat.stopping') }}</template>
                  <template v-else-if="progress(m)?.tool">
                    {{ progress(m)?.tool }}<template v-if="(progress(m)?.tools || 0) > 1">
                      · {{ t('chat.step', { n: progress(m)?.tools }) }}</template>
                  </template>
                  <template v-else>{{ t('chat.thinking') }}</template>
                </span>
                <button v-if="!progress(m)?.stopping"
                        class="meta ml-2 hover:text-rose transition-colors"
                        :disabled="stopping === m.id"
                        @click="stop(m.id)">{{ t('chat.stop') }}</button>
              </div>
              <p v-if="progress(m)?.preview" class="meta mt-1 truncate">{{ progress(m)?.preview }}</p>
            </div>
            <ApprovalPrompt
              v-else-if="m.state === 'approval'"
              :message-id="m.id"
              :channel-id="channelId"
              :bot-name="author(m)"
              :approval="m.approval"
              @resolved="fetchMessages" />
            <p v-else-if="m.state === 'error'" class="answer text-sm text-rose">{{ m.body }}</p>
            <MarkdownText v-else-if="m.authorKind === 'bot'" :text="m.body" class="text-sm" />
            <p v-else class="answer text-sm text-ink">{{ m.body }}</p>
            <!-- Context size, not cost. The api_server reports this as
                 input + cache reads + cache writes; the money is on the Cost
                 page, from Hermes' own accounting. -->
            <p v-if="m.inputTokens" class="meta mt-1">
              {{ t('chat.context', {
                input: m.inputTokens.toLocaleString(locale),
                output: (m.outputTokens || 0).toLocaleString(locale),
              }) }}
            </p>
          </div>
        </article>
      </div>

      <footer class="border-t border-edge p-3 panel shrink-0">
        <form class="flex gap-2" @submit.prevent="send">
          <input
            v-model="draft"
            class="field"
            :placeholder="isDm
              ? t('chat.placeholderDm', { name: channel?.name || '' })
              : t('chat.placeholder', { channel: channel?.name || '' })" />
          <button class="btn btn-primary" :disabled="sending || !draft.trim()">
            {{ t('chat.send') }}
          </button>
        </form>
      </footer>
    </main>
  </div>
</template>
