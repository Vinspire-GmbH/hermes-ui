import { useDb, schema } from '~~/server/db'
import { hashToken } from '~~/server/utils/tokens'
import { eq } from 'drizzle-orm'

/**
 * Check an invitation without using it up — that is what the join page needs
 * before it shows a form.
 *
 * The answer says only whether it is valid and which address was suggested.
 * Nothing about who invited whom: this endpoint is open by necessity, and a
 * guessed token should reveal nothing beyond "no".
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const [row] = await useDb().select().from(schema.invites)
    .where(eq(schema.invites.tokenHash, hashToken(token))).limit(1)
  if (!row || row.acceptedAt || row.expiresAt < Date.now()) {
    return { valid: false }
  }
  return { valid: true, email: row.email, role: row.role }
})
