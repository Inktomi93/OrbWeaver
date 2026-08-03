// `local` (AUTH_MODE=local, app-stored username+password) shares the `__Host-orb_session` cookie with
// `oidc`. Post-D40 the cookie read/validate is the seam's job (`entry/auth/seam.ts` calls
// `sessions.validate` directly), so at the infra layer this mode resolves to `null` and `resolve` falls
// through to the owner-fallback / unauth path. Both cookie modes delegate to the shared `cookie-session`
// null-returner. The PASSWORD half (mint/verify) lives in `../password.ts`, consumed by the entry login
// route, not here.

import type { ResolvedIdentity } from "@orb/contracts/identity";
import { resolveCookieSession } from "./cookie-session.ts";

export function resolveLocal(): Promise<ResolvedIdentity | null> {
  return resolveCookieSession();
}
