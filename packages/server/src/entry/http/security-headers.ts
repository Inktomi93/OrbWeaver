// The app-document CSP + sibling security headers. Wired first in entry/app.ts so headers apply to every
// response, including early 403s.
//
// `img-src`/`media-src` drop `data:` in prod (no data-URI images exist by build config); `blob:` stays for
// client-minted object URLs. Dev re-adds `data:` only for the TanStack Devtools inline logo. Untrusted
// content is isolated by the per-frame sandbox CSP (@orb/ui sandbox-frame), never by this policy.
//
// `style-src 'unsafe-inline'` is deliberate — do NOT harden to a nonce: Tailwind and Base UI both inject
// first-party inline `<style>`; the real guard is the strict `script-src`.
//
// `script-src` is `'self'`-only in prod (zero intentional inline scripts today). If an anti-FOUC inline
// script ever lands in index.html, use a boot-time hash-allowlist — never `'unsafe-inline'`.

import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";

const SELF = "'self'";
const NONE = "'none'";
// Tenor gif-search previews: the picker renders Tenor CDN previews inline. Scoped to *.tenor.com
// (subdomains only) — a reputable CDN, no attacker-controlled host. The import fetch is separately
// host-gated server-side; this only permits the client-side preview <img> load.
const TENOR_MEDIA = "https://*.tenor.com";

export function securityHeaders(opts: { readonly dev: boolean }): MiddlewareHandler {
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: [SELF],
      scriptSrc: opts.dev ? [SELF, "'unsafe-inline'", "'unsafe-eval'"] : [SELF],
      // blob: workers/SharedWorkers fall back to script-src without an explicit worker-src (which lacks blob:).
      // Dev AND prod — the worker-backed feature runs in both.
      workerSrc: [SELF, "blob:"],
      styleSrc: [SELF, "'unsafe-inline'"], // deliberate — see the header
      imgSrc: opts.dev ? [SELF, "blob:", "data:", TENOR_MEDIA] : [SELF, "blob:", TENOR_MEDIA],
      mediaSrc: [SELF, "blob:"],
      connectSrc: opts.dev ? [SELF, "ws:", "wss:"] : [SELF], // ws is HMR-only
      fontSrc: [SELF],
      baseUri: [SELF],
      formAction: [SELF],
      objectSrc: [NONE],
      frameAncestors: [NONE],
    },
    // Single-user plain-http LAN self-host: HSTS would poison the origin for the http:// case.
    strictTransportSecurity: false,
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "strict-origin-when-cross-origin",
    crossOriginOpenerPolicy: "same-origin",
  });
}
