/**
 * Whether the sidebar drawer is open.
 *
 * Shared state rather than a prop, because the toggle lives in each page's
 * header and the drawer lives in a component beside it. On wide screens the
 * sidebar is always visible and this value is ignored.
 */
export function useNav() {
  const open = useState('nav-open', () => false)
  const route = useRoute()
  // Following a link on a phone should reveal the destination, not leave the
  // drawer sitting over it.
  watch(() => route.fullPath, () => { open.value = false })
  return { open, toggle: () => { open.value = !open.value } }
}
