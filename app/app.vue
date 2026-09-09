<script setup lang="ts">
const { locale } = useI18n()
useHead({
  htmlAttrs: { lang: locale, class: 'dark' },
  link: [{ rel: 'manifest', href: '/manifest.webmanifest' }],
  meta: [
    { name: 'theme-color', content: '#05070d' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
  ],
})
</script>

<template>
  <div class="relative min-h-full">
    <div class="starfield" aria-hidden="true" />
    <div class="scanline" aria-hidden="true" />
    <div class="relative z-10 min-h-full">
      <NuxtPage />
    </div>
  </div>
</template>
