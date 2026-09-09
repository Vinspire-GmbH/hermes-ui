import { pushPublicKey } from '~~/server/utils/push'

/** The VAPID public key the browser needs to subscribe. Null means: not set up. */
export default defineEventHandler(() => ({ key: pushPublicKey() }))
