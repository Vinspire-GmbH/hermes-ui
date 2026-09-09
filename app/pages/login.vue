<script setup lang="ts">
const { data: stand } = await useFetch('/api/setup')
const einrichten = computed(() => stand.value?.eingerichtet === false)

const name = ref('')
const email = ref('')
const passwort = ref('')
const fehler = ref('')
const laeuft = ref(false)

async function abschicken() {
  fehler.value = ''
  laeuft.value = true
  try {
    if (einrichten.value) {
      await $fetch('/api/setup', { method: 'POST', body: { name: name.value, email: email.value, passwort: passwort.value } })
    } else {
      await $fetch('/api/auth/login', { method: 'POST', body: { email: email.value, passwort: passwort.value } })
    }
    await navigateTo('/')
  } catch (e: any) {
    fehler.value = e?.data?.statusMessage || e?.statusMessage || 'Es hat nicht geklappt'
  } finally {
    laeuft.value = false
  }
}
</script>

<template>
  <div class="min-h-screen grid place-items-center p-6">
    <form class="w-full max-w-sm bg-flaeche border border-rand rounded-xl p-6" @submit.prevent="abschicken">
      <h1 class="text-xl mb-1">Hermes</h1>
      <p class="text-leise text-sm mb-6">
        {{ einrichten ? 'Erste Einrichtung — leg dein Administratorkonto an.' : 'Anmeldung' }}
      </p>

      <label v-if="einrichten" class="block mb-3">
        <span class="text-xs text-leise">Name</span>
        <input v-model="name" required class="mt-1 w-full bg-grund border border-rand rounded px-3 py-2" />
      </label>
      <label class="block mb-3">
        <span class="text-xs text-leise">E-Mail</span>
        <input v-model="email" type="email" required autocomplete="username"
               class="mt-1 w-full bg-grund border border-rand rounded px-3 py-2" />
      </label>
      <label class="block mb-4">
        <span class="text-xs text-leise">Passwort</span>
        <input v-model="passwort" type="password" required
               :autocomplete="einrichten ? 'new-password' : 'current-password'"
               class="mt-1 w-full bg-grund border border-rand rounded px-3 py-2" />
      </label>

      <p v-if="fehler" class="text-sm text-red-400 mb-3">{{ fehler }}</p>
      <button :disabled="laeuft"
              class="w-full bg-akzent text-grund font-medium rounded px-3 py-2 disabled:opacity-50">
        {{ laeuft ? 'Moment…' : (einrichten ? 'Konto anlegen' : 'Anmelden') }}
      </button>
    </form>
  </div>
</template>
