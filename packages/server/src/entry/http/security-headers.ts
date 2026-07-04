// entry/http/security-headers — the app-document CSP + sibling security headers (D44 §12.5's
// "CSP headers" home; the authored policy client-tooling-setup.md §7.5 was the reference for —
// neo's verified `secureHeaders` shape with the two D44 deltas applied). Wired FIRST in
// `entry/app.ts` (headers apply to every response, including early 403s).
//
// The D44 deltas from neo (both deliberate):
//   • `img-src` drops `data:` — `allowDataImages:false` (D44 §12.3) + the client build's
//     `assetsInlineLimit: 0` mean no data-URI images exist; `blob:` stays for client-minted
//     object URLs. `media-src` mirrors it (native a/v is the same external-load class — §12.3).
//   • Untrusted content is isolated by the PER-FRAME sandbox CSP (`@orb/ui` sandbox-frame
//     `srcdoc.ts`), never by this app-document policy.
//
// `style-src 'unsafe-inline'` is a DELIBERATE, reasoned choice — do NOT "harden" it to a nonce:
// Tailwind AND Base UI both inject first-party inline `<style>` (ScrollArea/Select scrollbar
// removal); a nonce needs per-request HTML templating + Vite `html.cspNonce` + Base UI's
// `CSPProvider` — real infra against a weak threat class (injected `<style>` can't execute).
// The real guard is the strict `script-src`. (§7.5's boxed warning, carried verbatim.)
//
// `script-src` is `'self'`-only in prod: the client ships ZERO intentional inline scripts today
// (the preload-recovery listener lives in main.tsx, bundled). If an anti-FOUC inline script ever
// lands in index.html, port neo's boot-time sha256-from-built-index hash-allowlist — never
// 'unsafe-inline'. Dev loosens exactly two directives for Vite HMR (inline/eval + ws).

import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";

const SELF = "'self'";
const NONE = "'none'";

export function securityHeaders(opts: { readonly dev: boolean }): MiddlewareHandler {
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: [SELF],
      scriptSrc: opts.dev ? [SELF, "'unsafe-inline'", "'unsafe-eval'"] : [SELF],
      styleSrc: [SELF, "'unsafe-inline'"], // deliberate — see the header
      imgSrc: [SELF, "blob:"], // no data: (D44)
      mediaSrc: [SELF, "blob:"], // the §12.3 native-a/v backstop, same posture as img-src
      connectSrc: opts.dev ? [SELF, "ws:", "wss:"] : [SELF], // SSE is plain HTTP; ws is HMR-only
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
