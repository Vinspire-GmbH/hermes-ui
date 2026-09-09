<script setup lang="ts">
const { me, channels, load } = useConsole()
const { t } = useI18n()
await load()
if (!me.value) await navigateTo('/login')
else if (channels.value.length) await navigateTo(`/c/${channels.value[0].id}`)
</script>

<template>
  <div class="min-h-screen grid place-items-center">
    <p class="text-muted text-sm">{{ t('chat.noChannel') }}</p>
  </div>
</template>
