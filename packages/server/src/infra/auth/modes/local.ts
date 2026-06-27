// `local` (AUTH_MODE=local, app-stored username+password) reads the SAME `__Host-orb_session` cookie
// `oidc` does — only HOW the session is minted differs (POST /api/auth/login here vs the OIDC callback).
// The cookie-validation read path is identical, so both modes delegate to `cookie-session`. The PASSWORD
// half (mint/verify) lives in `../password.ts` and is consumed by the entry login route, not here.

import type { ResolveDeps, ValidatedSession } from "../contract";
import { resolveCookieSession } from "./cookie-session";

export function resolveLocal(
  headers: Headers,
  deps: ResolveDeps,
): Promise<ValidatedSession | null> {
  return resolveCookieSession(headers, deps);
}
