// The CSRF mutation-header signal. `SameSite=Lax` + this custom header is the whole CSRF story: a
// cross-site page can't set a custom request header without a CORS preflight the app never grants.
// infra/auth PRODUCES the signal; the GATE (a cookie-authenticated MUTATION without the header → 403)
// is ENFORCED at the seam / the authed-procedure ladder (route tier), keyed on `Principal.via` +
// this signal (spine §3 — CSRF keys on the seam's `Principal.via === "cookie"` + this header flag).

/** The custom CSRF request header (orbweaver-namespaced; was neo's `x-neo-csrf`). */
export const CSRF_HEADER = "x-orb-csrf";

/** True when the request carries the custom CSRF header (any value). */
export function hasCsrfHeader(headers: Headers): boolean {
  return headers.get(CSRF_HEADER) !== null;
}
