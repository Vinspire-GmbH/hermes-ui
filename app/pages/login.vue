<script setup lang="ts">
const { t } = useI18n()
const { data: status } = await useFetch('/api/setup')
const firstRun = computed(() => status.value?.configured === false)

const name = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    const body = firstRun.value
      ? { name: name.value, email: email.value, password: password.value }
      : { email: email.value, password: password.value }
    await $fetch(firstRun.value ? '/api/setup' : '/api/auth/login', { method: 'POST', body })
    await navigateTo('/')
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || t('auth.failed')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="min-h-screen grid place-items-center p-6">
    <form class="w-full max-w-sm panel panel-clip bracket p-7" @submit.prevent="submit">
      <div class="flex items-center gap-2 mb-6">
        <span class="w-1.5 h-1.5 bg-cyan shadow-[0_0_10px_#22d3ee]" />
        <span class="font-mono text-sm tracking-[.25em] text-cyan uppercase">{{ t('app.name') }}</span>
        <span class="label ml-auto">{{ t('app.tagline') }}</span>
      </div>

      <h1 class="text-lg mb-1">{{ firstRun ? t('auth.setupTitle') : t('auth.signIn') }}</h1>
      <p v-if="firstRun" class="text-sm text-muted mb-6">{{ t('auth.setupHint') }}</p>
      <div v-else class="mb-6" />

      <label v-if="firstRun" class="block mb-3">
        <span class="label">{{ t('auth.name') }}</span>
        <input v-model="name" required class="field mt-1" />
      </label>
      <label class="block mb-3">
        <span class="label">{{ t('auth.email') }}</span>
        <input v-model="email" type="email" required autocomplete="username" class="field mt-1" />
      </label>
      <label class="block mb-5">
        <span class="label">{{ t('auth.password') }}</span>
        <input v-model="password" type="password" required
               :autocomplete="firstRun ? 'new-password' : 'current-password'" class="field mt-1" />
      </label>

      <p v-if="error" class="text-sm text-rose mb-3">{{ error }}</p>
      <button :disabled="busy" class="btn btn-primary w-full">
        {{ busy ? t('auth.working') : (firstRun ? t('auth.createAccount') : t('auth.submit')) }}
      </button>

      <div class="mt-6 pt-4 border-t border-edge -mx-1">
        <LanguageSwitch />
      </div>
    </form>
  </div>
</template>
