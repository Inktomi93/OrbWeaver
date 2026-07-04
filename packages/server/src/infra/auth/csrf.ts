// The CSRF mutation-header signal. `SameSite=Lax` + this custom header is the whole CSRF story: a
// cross-site page can't set a custom request header without a CORS preflight the app never grants.
// infra/auth PRODUCES the signal; the GATE (a cookie-authenticated MUTATION without the header → 403)
// is ENFORCED at the seam / the authed-procedure ladder (route tier), keyed on `Principal.via` +
// this signal (spine §3 — CSRF keys on the seam's `Principal.via === "cookie"` + this header flag).

// The header NAME's one home moved to `@orb/contracts/identity` (the client sends it, so it is a
// cross-boundary wire fact — promoted Phase 6); the infra/auth barrel re-exports it for the
// existing server-side consumers. This file keeps only the signal predicate.
import { CSRF_HEADER } from "@orb/contracts/identity";

/** True when the request carries the custom CSRF header (any value). */
export function hasCsrfHeader(headers: Headers): boolean {
  return headers.get(CSRF_HEADER) !== null;
}
