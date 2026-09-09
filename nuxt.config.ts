import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  modules: ['nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },

  // Der Agent antwortet nicht in Millisekunden: ein Lauf mit Werkzeugen dauert
  // gut und gern eine Minute. Nitro darf die Anfrage nicht vorher abschneiden.
  nitro: {
    experimental: { websocket: true },
    routeRules: { '/api/**': { cors: false } },
  },

  runtimeConfig: {
    // Sitzungsschluessel fuer die Cookies; in Produktion aus NUXT_SESSION_PASSWORD.
    session: { maxAge: 60 * 60 * 24 * 30 },
    // Ablage der SQLite-Datei. Auf Coolify auf ein Volume legen.
    dbPath: process.env.HERMES_UI_DB || './.data/hermes-ui.db',
    public: {
      appName: 'Hermes',
    },
  },

  typescript: { strict: true },
  devtools: { enabled: true },
})
