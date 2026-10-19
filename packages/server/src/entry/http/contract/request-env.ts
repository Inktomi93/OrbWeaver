// The Hono request env the auth middleware writes for every entry route registrar (D329).

import type { Principal } from "@orb/contracts/identity";
import type { SessionId } from "@orb/kit/ids";

/** The request-context shape EVERY principal-reading route registrar in this directory types its `app`
 *  against — declared once here rather than re-spelled per route file. It is the
 *  WHOLE set of vars the auth middleware writes, not just the ones this route reads: Hono's env generic is
 *  INVARIANT, so one app instance cannot satisfy two different `Variables` shapes.
 *
 *  `sessionId` (W7a) is the cookie session that admitted the request, `null` on every other admission arm. It
 *  rides BESIDE the principal because D135 keeps the Principal to the role verdict `users` owns; its one
 *  consumer is the tRPC context, where `stream.connect` stamps it on the socket cell so a logout can evict
 *  exactly that device's streams. No route here authorizes on it. */
export interface PrincipalEnv {
  // biome-ignore lint/style/useNamingConvention: `Variables` is Hono's reserved Env key (framework-fixed name).
  Variables: { principal: Principal | null; sessionId: SessionId | null };
}
