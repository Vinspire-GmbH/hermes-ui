<script setup lang="ts">
/** A page header with the drawer toggle, which only exists below `lg`. */
const { toggle } = useNav()
</script>

<template>
  <header class="px-4 lg:px-6 py-3 border-b border-edge panel flex items-center gap-3">
    <button
      class="lg:hidden -ml-1 p-2 text-muted hover:text-cyan transition-colors"
      aria-label="Menu"
      @click="toggle">
      <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
        <path d="M0 1h18M0 7h18M0 13h18" stroke="currentColor" stroke-width="1.5" />
      </svg>
    </button>
    <slot />
  </header>
</template>
