// The app-document CSP + sibling security headers. Wired first in entry/app.ts so headers apply to every
// response, including early 403s.
//
// `img-src`/`media-src` drop `data:` in prod (no data-URI images exist by build config); `blob:` stays for
// client-minted object URLs. Dev re-adds `data:` only for the TanStack Devtools inline logo. Untrusted
// content is isolated by the per-frame sandbox CSP (@orb/ui sandbox-frame), never by this policy.
//
// SETTING-DEPENDENT (the one variable directive pair): the app-tier "Block external media" AppSetting
// (`forbidExternalMedia`) is the DEPLOYMENT CEILING for external media, and this header IS that ceiling.
// While the setting allows external media, `img-src`/`media-src` gain `https:` — otherwise the app-tier
// gate (MessageMedia's click-to-load + the per-character renderPolicy) would be a placebo: the click
// resolves, the fetch is CSP-blocked, and the reader gets "Media unavailable". Scope is deliberately
// minimal:
//   • ONLY `img-src` + `media-src` — the two directives the setting's own copy names ("http/https media
//     URLs"). `script-src`/`connect-src`/`font-src`/`object-src` NEVER vary: a rendered <img> is a
//     tracking pixel, a rendered <script> is code execution, and the setting is about the former.
//   • `https:` only, NEVER `http:` — a plaintext subresource is passively observable on the wire and the
//     app itself is commonly served over plain-http LAN (no HSTS, see below), so an `http:` allowance
//     would be an unauthenticated cleartext exfil channel with no upgrade path.
// Both layers stay on when the setting FORBIDS (belt AND suspenders): the CSP blocks the fetch and the
// app-tier gate never renders the element. The two layers CANNOT disagree, because the app-tier gate's
// resolver is tighten-only (`@orb/contracts/chat::resolveRenderPolicy`, owner ruling 2026-08-01): a
// per-character "allow" can no longer resolve to allowed under a blocking deployment and then eat a CSP
// block. This header stays DEPLOYMENT-ONLY on purpose — it is a per-document header, and a document
// carries messages from many characters, so it can only ever express the ceiling.
//
// The read is a THUNK (`allowExternalMedia`), per-request, off `settings.getEffectiveConfig()` — the
// module-scope resolved-config cache that `reloadEffectiveConfig` rebuilds after every admin write. So a
// flip is live on the NEXT response; no boot, no invalidation of our own. It is NOT live for an already-
// open tab (a document keeps the CSP it was delivered with), which is why the admin toggle's hint says
// "reload".
//
// `style-src 'unsafe-inline'` is deliberate — do NOT harden to a nonce: Tailwind and Base UI both inject
// first-party inline `<style>`; the real guard is the strict `script-src`.
//
// `script-src` is `'self'`-only in prod (zero intentional inline scripts today). If an anti-FOUC inline
// script ever lands in index.html, use a boot-time hash-allowlist — never `'unsafe-inline'`.

import { CARD_FRAME_ROUTE } from "@orb/contracts/chat";
import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";

// THE ONE EXEMPTION, and it is a MECHANICAL necessity, not a policy carve-out: `hono/secure-headers` sets
// its headers AFTER `next()` with `.set()`, so it OVERWRITES whatever a handler wrote. The card-frame
// DOCUMENT (`GET /api/card-frame/<id>`) exists precisely to carry its own, TIGHTER policy — a routed
// document does not inherit ours, which is the only way a per-character trust grant can widen `img-src`
// for a card (see `@orb/kit/card-frame`). Leaving this middleware on that path would silently replace the
// frame policy with the APP policy: the frame would become a document with `script-src 'self'` and no
// `sandbox` directive, i.e. the exact opposite of the intent, with nothing red.
//
// The exemption is the DOCUMENT path only — the `POST /api/card-frame` MINT is a JSON reply and keeps the
// full app header set. The exempted responses are never un-policied: every return path in `card-frame.ts`
// builds its headers from `frameHeaders()`, including the 401/404 arms.
const CARD_FRAME_DOC_PREFIX = `${CARD_FRAME_ROUTE}/`;

function servesOwnPolicy(path: string): boolean {
  return path.startsWith(CARD_FRAME_DOC_PREFIX);
}

const SELF = "'self'";
const NONE = "'none'";
const BLOB = "blob:";
const DATA = "data:";
/** The external-media allowance. `https:` only — see the header's scope note. */
const HTTPS = "https:";

export interface SecurityHeadersOptions {
  readonly dev: boolean;
  /**
   * Live read of the app-tier external-media ceiling: `true` ⇒ `img-src`/`media-src` gain `https:`.
   * Wired at `entry/app.ts` as `() => !settings.getEffectiveConfig().forbidExternalMedia`.
   */
  readonly allowExternalMedia: () => boolean;
}

/** One fully-formed policy per (dev × allowExternalMedia) arm — never a partially-mutated directive list. */
function policy(opts: { readonly dev: boolean; readonly external: boolean }): MiddlewareHandler {
  const mediaHosts = opts.external ? [HTTPS] : [];
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: [SELF],
      scriptSrc: opts.dev ? [SELF, "'unsafe-inline'", "'unsafe-eval'"] : [SELF],
      // blob: workers/SharedWorkers fall back to script-src without an explicit worker-src (which lacks blob:).
      // Dev AND prod — the worker-backed feature runs in both.
      workerSrc: [SELF, BLOB],
      styleSrc: [SELF, "'unsafe-inline'"], // deliberate — see the header
      imgSrc: opts.dev ? [SELF, BLOB, DATA, ...mediaHosts] : [SELF, BLOB, ...mediaHosts],
      mediaSrc: [SELF, BLOB, ...mediaHosts],
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

export function securityHeaders(opts: SecurityHeadersOptions): MiddlewareHandler {
  // Both arms are built ONCE at wiring time; the per-request work is the boolean read + a dispatch.
  const blocked = policy({ dev: opts.dev, external: false });
  const allowed = policy({ dev: opts.dev, external: true });
  return (c, next) => {
    if (servesOwnPolicy(c.req.path)) {
      return next();
    }
    return (opts.allowExternalMedia() ? allowed : blocked)(c, next);
  };
}
