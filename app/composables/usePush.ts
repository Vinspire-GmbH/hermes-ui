/**
 * Web Push, from the browser's side.
 *
 * Three things have to line up: a service worker, permission, and a
 * subscription that the server knows about. Each can be missing on its own, so
 * `state` reports which — "unsupported" and "denied" need different words to
 * the person reading them, and neither is a bug to be retried.
 */
export function usePush() {
  const state = useState<'unknown' | 'unsupported' | 'off' | 'on' | 'denied'>('push', () => 'unknown')
  const busy = ref(false)

  const supported = () => import.meta.client
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window

  async function refresh() {
    if (!supported()) { state.value = 'unsupported'; return }
    if (Notification.permission === 'denied') { state.value = 'denied'; return }
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    state.value = sub ? 'on' : 'off'
  }

  async function enable() {
    if (!supported()) return
    busy.value = true
    try {
      const { key } = await $fetch<{ key: string | null }>('/api/push/key')
      if (!key) throw new Error('Push is not configured on the server')

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { state.value = permission === 'denied' ? 'denied' : 'off'; return }

      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      })
      await $fetch('/api/push/subscribe', { method: 'POST', body: sub.toJSON() })
      state.value = 'on'
    } finally {
      busy.value = false
    }
  }

  async function disable() {
    busy.value = true
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await $fetch('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } })
        await sub.unsubscribe()
      }
      state.value = 'off'
    } finally {
      busy.value = false
    }
  }

  return { state, busy, refresh, enable, disable }
}

/**
 * The VAPID key travels as base64url and has to reach `subscribe` as bytes.
 * Browsers reject a string here with a message that names neither the field
 * nor the reason, so this conversion is not optional decoration.
 */
function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + '='.repeat((4 - base64.length % 4) % 4))
    .replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}
