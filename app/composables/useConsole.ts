/** Shared state: who am I, which channels and bots exist. */
export function useConsole() {
  const me = useState<any>('me', () => null)
  const channels = useState<any[]>('channels', () => [])
  const bots = useState<any[]>('bots', () => [])
  const users = useState<any[]>('users', () => [])

  /**
   * `useRequestFetch` rather than `$fetch`, and that is not a style choice.
   *
   * During server rendering a plain `$fetch` to an own API route carries no
   * cookies, so `/api/auth/me` answers null even for someone who is signed
   * in — and every cold load bounces through the sign-in page, losing the URL
   * that was asked for. `useRequestFetch` forwards the incoming request's
   * headers on the server and behaves like `$fetch` in the browser.
   */
  async function load() {
    const request = useRequestFetch()
    me.value = await request('/api/auth/me')
    if (!me.value) return
    const [c, b, u] = await Promise.all([
      request<any[]>('/api/channels'),
      request<any[]>('/api/bots'),
      request<any[]>('/api/users'),
    ])
    channels.value = c
    bots.value = b
    users.value = u
  }

  const bot = (id: string) => bots.value.find(b => b.id === id)
  const botName = (id: string) => bot(id)?.name ?? 'Bot'
  const botColor = (id: string) => bot(id)?.color ?? '#22d3ee'
  const userName = (id: string) => users.value.find(u => u.id === id)?.name ?? 'Someone'
  const isAdmin = computed(() => me.value?.role === 'admin')

  return { me, channels, bots, users, load, bot, botName, botColor, userName, isAdmin }
}
