<script setup lang="ts">
const { ich, kanaele, laden } = useHermesUi()
await laden()
if (!ich.value) await navigateTo('/login')
else if (kanaele.value.length) await navigateTo(`/c/${kanaele.value[0].id}`)
</script>

<template>
  <div class="min-h-screen grid place-items-center text-leise">
    Noch kein Kanal — lege einen an.
  </div>
</template>
