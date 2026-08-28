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
// script ever lands in index.html, use a boot-time hash-allowlist — never `'unsafe-inline'`. This is not a
// prose-only wish: the interactive-card srcdoc FLOOR (@orb/ui sandbox-frame's degraded arm) stays
// script-DEAD because a srcdoc inherits+intersects THIS policy, so a widening here silently reanimates it.
// ENFORCED by tests/server/entry/http/security-headers.test.ts ("prod script-src grants no script-execution
// escape") — the prod `script-src` admits none of `'unsafe-inline'`/`'unsafe-eval'`/`'strict-dynamic'`/a
// host wildcard. The #111 security review (CLEAN, verdict on the issue's review comment) named this the
// one durable watch-item.
//
// DECLINED, 2026-08-16 tier-B card-frame pass (#91) — the card frame's height script is NOT hash-allowed
// here. That script (`@orb/kit/card-frame`) rides the ROUTED card document's own response policy, which
// this middleware deliberately steps aside for. The srcdoc FLOOR, by contrast, inherits THIS policy on top
// of its own, so the floor can only measure itself if the hash is added in both places. It was not, on
// purpose: this is the app document's policy — the last line of defence for the SPA's own origin — and the
// floor is the degraded arm (a story/CT mount, an unresolved or failed mint), where a fixed frame height is
// an acceptable outcome and a widened app `script-src` is not. Re-opening that trade is a security call,
// not a UI one. RE-AFFIRMED at the #111 leg-3 interactive grant: that grant runs card scripts on the ROUTED
// arm only, precisely because the routed document's policy is its OWN. Nothing about it reaches this file's
// `script-src`, and the srcdoc floor stays script-dead on both postures.

import { CARD_FRAME_ROUTE } from "@orb/contracts/chat";
import { PLUGIN_FRAME_DOC_PREFIX } from "@orb/contracts/plugin";
import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";

// THE EXEMPTION LIST, and it is a MECHANICAL necessity, not a policy carve-out: `hono/secure-headers` sets
// its headers AFTER `next()` with `.set()`, so it OVERWRITES whatever a handler wrote. A ROUTED FRAME
// DOCUMENT exists precisely to carry its own, TIGHTER policy — a routed document does not inherit ours,
// which is the only way a per-document grant can differ from the app's at all (see `@orb/kit/card-frame`).
// Leaving this middleware on such a path would silently replace the frame policy with the APP policy: the
// frame would become a document with `script-src 'self'` and no `sandbox` directive, i.e. the exact
// opposite of the intent, with nothing red.
//
// TWO MEMBERS, one class. `GET /api/card-frame/<id>` (D44/#91 — a per-character trust grant widening
// `img-src` for a model-authored card) and, since #679 U7, `GET /api/plugin-frame/<id>` (the plugin-UI
// escape hatch — a plugin's own interface code in an isolated document). NOTHING ABOUT THE APP POLICY
// ITSELF CHANGED when the second member landed: not one directive was added, removed or widened, and the
// frames are same-origin so the `frame-src 'self'` belt below already admitted them. What changed is which
// paths this middleware steps aside for, which is the mechanism this exemption has always been.
//
// The exemption is the DOCUMENT path only — each route's `POST` MINT is a JSON reply and keeps the full app
// header set. The exempted responses are never un-policied: every return path in `card-frame.ts` and
// `plugin-frame.ts` builds its headers from that file's own frame-header builder, 401 and 404 arms included,
// and `tests/server/entry/http/{card,plugin}-frame.test.ts` pin the ACTUAL served header on both.
//
// Each prefix is DERIVED from its route's own contract constant, never re-typed here: a drifted copy would
// not fail loudly, it would silently serve that document under the app policy.
const CARD_FRAME_DOC_PREFIX = `${CARD_FRAME_ROUTE}/`;
const OWN_POLICY_DOC_PREFIXES = [CARD_FRAME_DOC_PREFIX, PLUGIN_FRAME_DOC_PREFIX] as const;

function servesOwnPolicy(path: string): boolean {
  return OWN_POLICY_DOC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

const SELF = "'self'";
const NONE = "'none'";
/** WebAssembly compilation ONLY — never JS eval, never inline, never a new load origin. See its use site. */
const WASM_EVAL = "'wasm-unsafe-eval'";
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
      // `'wasm-unsafe-eval'` — THE ONE APP-CSP DELTA the plugin UI plane asks for (plugin-ui-plane #679 §4.6 /
      // §9 / seam 10), added deliberately and reviewed as its own change.
      //
      // WHAT IT PERMITS, exactly: compiling and instantiating WebAssembly. That is the whole keyword. It does
      // NOT permit `eval`, it does NOT permit inline script, it does NOT widen where script may be LOADED from
      // — `'self'` still decides that, so the srcdoc card-floor's script-death (pinned in this file's test) is
      // untouched: a srcdoc has no origin to be "self", and a wasm keyword gives it no bytes to compile.
      //
      // WHY IT IS NEEDED: the Tier-C plugin guest is a QuickJS interpreter compiled to WASM, running in a Web
      // Worker on this origin. A worker inherits the CSP of the response that served its script, which is this
      // one, so without the keyword `WebAssembly.instantiate` throws and no scripted plugin surface can exist.
      //
      // THE REJECTED ALTERNATIVE, named so it is not re-proposed: host the interpreter in a sandboxed iframe to
      // dodge the directive. That re-imports the whole frame arm the owner killed (§3-ARM-B) — token injection,
      // no a11y floor, the #124 exfil class — in exchange for avoiding a keyword whose scope is narrow and
      // auditable. The keyword is the smaller price and the honest one.
      //
      // BOTH ARMS carry it. Dev's `'unsafe-eval'` already subsumes wasm compilation, so naming it there changes
      // nothing a browser does — but a directive that differs between dev and prod is a directive that gets
      // debugged in the wrong environment, and the whole point of this pair is that they differ ONLY in the two
      // HMR loosenings the test pins.
      scriptSrc: opts.dev ? [SELF, "'unsafe-inline'", "'unsafe-eval'", WASM_EVAL] : [SELF, WASM_EVAL],
      // blob: workers/SharedWorkers fall back to script-src without an explicit worker-src (which lacks blob:).
      // Dev AND prod — the worker-backed feature runs in both.
      workerSrc: [SELF, BLOB],
      styleSrc: [SELF, "'unsafe-inline'"], // deliberate — see the header
      imgSrc: opts.dev ? [SELF, BLOB, DATA, ...mediaHosts] : [SELF, BLOB, ...mediaHosts],
      mediaSrc: [SELF, BLOB, ...mediaHosts],
      connectSrc: opts.dev ? [SELF, "ws:", "wss:"] : [SELF], // ws is HMR-only
      // THE CARD-FRAME NAVIGATION BELT, named rather than inherited (#111 leg 3). Behaviourally identical
      // to the `default-src 'self'` fallback it replaces — the app frames exactly one thing, its own
      // `/api/card-frame/<id>` — but the EMBEDDER's policy is what decides where a card frame may navigate,
      // whoever initiates it (measured: `@orb/kit/card-frame`'s FRAME NAVIGATION block). Leaving that on a
      // fallback meant any future widening of `default-src` for an unrelated reason would silently hand
      // model-authored cards an off-origin navigation. Now it takes deleting this line.
      frameSrc: [SELF],
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
