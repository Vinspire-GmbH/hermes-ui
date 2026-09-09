/** Gemeinsamer Zustand: wer bin ich, welche Kanäle und Bots gibt es. */
export function useHermesUi() {
  const ich = useState<any>('ich', () => null)
  const kanaele = useState<any[]>('kanaele', () => [])
  const bots = useState<any[]>('bots', () => [])
  const nutzer = useState<any[]>('nutzer', () => [])

  async function laden() {
    ich.value = await $fetch('/api/auth/me')
    if (!ich.value) return
    const [k, b, n] = await Promise.all([
      $fetch<any[]>('/api/channels'),
      $fetch<any[]>('/api/bots'),
      $fetch<any[]>('/api/users'),
    ])
    kanaele.value = k; bots.value = b; nutzer.value = n
  }

  const botName = (id: string) => bots.value.find(b => b.id === id)?.name ?? 'Bot'
  const botFarbe = (id: string) => bots.value.find(b => b.id === id)?.color ?? '#4fd1c5'
  const nutzerName = (id: string) => nutzer.value.find(u => u.id === id)?.name ?? 'Jemand'

  return { ich, kanaele, bots, nutzer, laden, botName, botFarbe, nutzerName }
}
