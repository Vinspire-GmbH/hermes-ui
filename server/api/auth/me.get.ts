export default defineEventHandler(async (event) => {
  const s = await getUserSession(event)
  return (s as any)?.user ?? null
})
