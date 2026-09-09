import { useDb, schema } from '~~/server/db'
import { id } from '~~/server/utils/ids'
import { hashToken } from '~~/server/utils/tokens'
import { eq } from 'drizzle-orm'

/**
 * Use an invitation: create the account and sign in straight away.
 *
 * The invitation is marked used in the same step, so a link that gets
 * forwarded creates one account and not five.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const { name, email, password } = await readBody<{
    name?: string; email?: string; password?: string
  }>(event)
  if (!name || !email || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Name, email and password required' })
  }
  if (password.length < 10) {
    throw createError({ statusCode: 400, statusMessage: 'Password needs at least 10 characters' })
  }

  const db = useDb()
  const [invite] = await db.select().from(schema.invites)
    .where(eq(schema.invites.tokenHash, hashToken(token))).limit(1)
  if (!invite || invite.acceptedAt || invite.expiresAt < Date.now()) {
    throw createError({ statusCode: 410, statusMessage: 'This invitation is no longer valid' })
  }

  const uid = id('u')
  const now = Date.now()
  try {
    await db.insert(schema.users).values({
      id: uid, email: email.toLowerCase().trim(), name,
      passwordHash: await hashPassword(password), role: invite.role, createdAt: now,
    })
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'That email already has an account' })
  }
  await db.update(schema.invites)
    .set({ acceptedAt: now, acceptedBy: uid })
    .where(eq(schema.invites.id, invite.id))

  // Into the general channel, if there is one — an empty console on the first
  // visit looks broken.
  const [general] = await db.select().from(schema.channels)
    .where(eq(schema.channels.kind, 'channel')).limit(1)
  if (general) {
    await db.insert(schema.members).values({
      id: id('m'), channelId: general.id, kind: 'user', refId: uid, addedAt: now,
    })
  }

  await setUserSession(event, {
    user: { id: uid, name, email: email.toLowerCase().trim(), role: invite.role },
  })
  return { ok: true }
})
