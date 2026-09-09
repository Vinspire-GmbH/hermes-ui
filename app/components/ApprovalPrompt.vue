<script setup lang="ts">
/**
 * The question a blocked run is asking.
 *
 * Shown in place of a bot's answer while `state === 'approval'`. The command
 * is displayed verbatim (Hermes redacts credentials before it leaves the
 * agent), because approving a command you cannot see is worse than refusing
 * one you can.
 */
const props = defineProps<{
  messageId: string
  channelId: string
  botName: string
  approval: string | null
}>()
const emit = defineEmits<{ resolved: [] }>()
const { t } = useI18n()

const detail = computed(() => {
  if (!props.approval) return null
  try {
    return JSON.parse(props.approval) as {
      command?: string; tool?: string; reason?: string; choices?: string[]
    }
  } catch {
    return null
  }
})

const choices = computed(() => {
  const offered = detail.value?.choices?.length
    ? detail.value.choices
    : ['once', 'session', 'always', 'deny']
  // Keep a stable order regardless of what the agent listed, and never show
  // an option it did not offer.
  return (['once', 'session', 'always', 'deny'] as const).filter(c => offered.includes(c))
})

const busy = ref('')
const error = ref('')

async function answer(choice: string) {
  busy.value = choice
  error.value = ''
  try {
    await $fetch(`/api/channels/${props.channelId}/approval`, {
      method: 'POST',
      body: { messageId: props.messageId, choice },
    })
    emit('resolved')
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || t('common.error')
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <div class="border border-amber/50 bg-amber/5 p-3 space-y-3">
    <div class="flex items-center gap-2">
      <span class="w-1.5 h-1.5 bg-amber shadow-[0_0_10px_#fbbf24]" />
      <span class="label text-amber">{{ t('approval.title') }}</span>
    </div>

    <p class="text-sm text-ink">{{ t('approval.intro', { bot: botName }) }}</p>

    <div v-if="detail?.command">
      <span class="label">{{ t('approval.command') }}</span>
      <pre class="answer font-mono text-xs mt-1 p-2 bg-void border border-edge overflow-x-auto">{{ detail.command }}</pre>
    </div>
    <p v-else class="text-sm text-rose">{{ t('approval.noDetail') }}</p>

    <p v-if="detail?.tool" class="meta">{{ t('approval.tool') }}: {{ detail.tool }}</p>
    <p v-if="detail?.reason" class="text-sm text-muted">{{ detail.reason }}</p>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="c in choices" :key="c"
        class="btn"
        :class="c === 'deny' ? 'btn-danger' : (c === 'once' ? 'btn-primary' : '')"
        :disabled="!!busy"
        @click="answer(c)">
        {{ busy === c ? t('approval.sending') : t(`approval.${c}`) }}
      </button>
    </div>

    <p v-if="choices.includes('always')" class="meta">{{ t('approval.alwaysHint') }}</p>
    <p class="meta">{{ t('approval.expires') }}</p>
    <p v-if="error" class="text-sm text-rose">{{ error }}</p>
  </div>
</template>
