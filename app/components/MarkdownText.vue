<script setup lang="ts">
import { renderMarkdown } from '~/utils/markdown'

/**
 * The html here comes from `renderMarkdown`, which escapes every character of
 * content and emits only its own tags — no input HTML is ever passed through.
 * That is what makes `v-html` acceptable at this one place, and why there is
 * no sanitiser in the chain.
 */
const props = defineProps<{ text: string }>()
const html = computed(() => renderMarkdown(props.text))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="md" v-html="html" />
</template>
