import { useDb, schema } from '~~/server/db'
import { requireAdmin } from '~~/server/utils/auth'
import { id } from '~~/server/utils/ids'
import { newToken } from '~~/server/utils/tokens'

const DAYS = 14

/**
 * Invite someone.
 *
 * No mail is sent — this console has no mail server, and one that silently
 * fails to deliver is worse than none. The link comes back once and gets
 * passed on by whatever channel the team already uses.
 *
 * `email` is optional and only pre-fills the form. Binding the invitation to
 * an address would suggest a verification that is not happening.
 */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { email, role } = await readBody<{ email?: string; role?: string }>(event)
    .catch(() => ({ email: undefined, role: undefined }))

  const { token, hash } = newToken('inv')
  const now = Date.now()
  await useDb().insert(schema.invites).values({
    id: id('inv'), tokenHash: hash,
    email: email?.toLowerCase().trim() || null,
    role: role === 'admin' ? 'admin' : 'member',
    invitedBy: admin.id,
    expiresAt: now + DAYS * 24 * 60 * 60 * 1000,
    createdAt: now,
  })

  const origin = getRequestURL(event).origin
  return { token, url: `${origin}/join/${token}`, expiresInDays: DAYS }
})
