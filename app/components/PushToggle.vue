<script setup lang="ts">
const { state, busy, refresh, enable, disable } = usePush()
const { t } = useI18n()
onMounted(refresh)

const canInstall = ref(false)
let prompt: any = null
onMounted(() => {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault()
    prompt = e
    canInstall.value = true
  })
})
async function install() {
  if (!prompt) return
  await prompt.prompt()
  canInstall.value = false
}
</script>

<template>
  <div class="space-y-2">
    <p class="text-sm text-muted">
      <template v-if="state === 'on'">{{ t('push.on') }}</template>
      <template v-else-if="state === 'denied'">{{ t('push.denied') }}</template>
      <template v-else-if="state === 'unsupported'">{{ t('push.unsupported') }}</template>
      <template v-else>{{ t('push.off') }}</template>
    </p>
    <div class="flex flex-wrap gap-2">
      <button v-if="state === 'off'" class="btn btn-primary" :disabled="busy" @click="enable">
        {{ t('push.enable') }}
      </button>
      <button v-else-if="state === 'on'" class="btn" :disabled="busy" @click="disable">
        {{ t('push.disable') }}
      </button>
      <button v-if="canInstall" class="btn" @click="install">{{ t('push.install') }}</button>
    </div>
  </div>
</template>
