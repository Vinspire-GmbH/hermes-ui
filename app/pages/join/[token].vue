<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const token = route.params.token as string

const { data: invite } = await useFetch<{ valid: boolean; email?: string | null }>(
  `/api/invites/${token}`,
)

const name = ref('')
const email = ref(invite.value?.email || '')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  if (password.value.length < 10) { error.value = t('auth.passwordTooShort'); return }
  busy.value = true
  try {
    await $fetch(`/api/invites/${token}/accept`, {
      method: 'POST',
      body: { name: name.value, email: email.value, password: password.value },
    })
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
    <div class="w-full max-w-sm panel panel-clip bracket p-7">
      <div class="flex items-center gap-2 mb-6">
        <span class="w-1.5 h-1.5 bg-magenta shadow-[0_0_10px_#e879f9]" />
        <span class="font-mono text-sm tracking-[.25em] text-magenta uppercase">{{ t('app.name') }}</span>
      </div>

      <template v-if="invite?.valid">
        <h1 class="text-lg mb-1">{{ t('auth.joinTitle') }}</h1>
        <p class="text-sm text-muted mb-6">{{ t('auth.joinHint') }}</p>
        <form @submit.prevent="submit">
          <label class="block mb-3">
            <span class="label">{{ t('auth.name') }}</span>
            <input v-model="name" required class="field mt-1" />
          </label>
          <label class="block mb-3">
            <span class="label">{{ t('auth.email') }}</span>
            <input v-model="email" type="email" required autocomplete="username" class="field mt-1" />
          </label>
          <label class="block mb-5">
            <span class="label">{{ t('auth.password') }}</span>
            <input v-model="password" type="password" required autocomplete="new-password" class="field mt-1" />
          </label>
          <p v-if="error" class="text-sm text-rose mb-3">{{ error }}</p>
          <button :disabled="busy" class="btn btn-primary w-full">
            {{ busy ? t('auth.working') : t('auth.join') }}
          </button>
        </form>
      </template>

      <template v-else>
        <p class="text-sm text-rose">{{ t('auth.inviteInvalid') }}</p>
        <NuxtLink to="/login" class="btn mt-5 inline-block">{{ t('auth.signIn') }}</NuxtLink>
      </template>
    </div>
  </div>
</template>
