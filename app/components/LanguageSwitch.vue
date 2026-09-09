<script setup lang="ts">
const { locale, setLocale, locales, t } = useI18n()
</script>

<template>
  <div class="px-2 py-1.5 flex items-center gap-2">
    <span class="label">{{ t('common.language') }}</span>
    <button
      v-for="(name, code) in locales" :key="code"
      class="text-xs font-mono uppercase transition-colors"
      :class="locale === code ? 'text-cyan' : 'text-faint hover:text-muted'"
      @click="setLocale(code as any)">
      {{ code }}
      <span class="sr-only">{{ name }}</span>
    </button>
  </div>
</template>
