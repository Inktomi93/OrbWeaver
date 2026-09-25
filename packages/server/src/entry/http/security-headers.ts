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
import { isLoopbackHost } from "@orb/kit/allowed-hosts";
import type { Context, MiddlewareHandler, Next } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { requestTransport } from "#infra/auth";

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
// header set. The SERVED document and its MISS-404 both build their headers from their own file's
// frame-header builder, and `tests/server/entry/http/{card,plugin}-frame.test.ts` pin the ACTUAL served
// header on both. What the exemption may NOT assume is that one of those arms ran at all (#1594) — see
// {@link securityHeaders}.
//
// Each prefix is DERIVED from its route's own contract constant, never re-typed here: a drifted copy would
// not fail loudly, it would silently serve that document under the app policy.
const CARD_FRAME_DOC_PREFIX = `${CARD_FRAME_ROUTE}/`;
const OWN_POLICY_DOC_PREFIXES = [CARD_FRAME_DOC_PREFIX, PLUGIN_FRAME_DOC_PREFIX] as const;

/**
 * THE EXEMPTION IS A ROUTE-PATTERN MATCH, NEVER A PREFIX TEST (#1409). Both frame documents are registered
 * as `<prefix>:id`, and hono's path parameter matches exactly ONE segment (`LABEL_REG_EXP_STR = "[^/]+"`,
 * `node_modules/hono/dist/router/reg-exp-router/node.js`; the trie router splits on `/` for the same effect).
 * So `<prefix>a/b` matches NO handler — but a `startsWith` test still exempted it, and the framework's own
 * 404 then went out with NO security headers at all: no CSP, no `X-Frame-Options`, no `nosniff`, on a path
 * of the app's own origin. Stepping aside only for what a registered frame handler can actually serve keeps
 * the carve-out exactly as wide as the mechanism that needs it (see the exemption note above).
 *
 * The remaining segment is NOT shape-checked against the 32-hex handle grammar on purpose: a malformed id is
 * SERVED by the frame route (its 404 arm returns `MISS_DOC` under that file's own frame headers), so it is a
 * response that carries its own policy and must stay exempt. "One more segment" is the honest predicate —
 * it is what the router itself will route.
 *
 * WHAT MAKES "what the router will route" TRUE, since this predicate re-derives a routing decision (#1611):
 * `c.req.path` is not a second reading of the URL. hono's `#dispatch` computes the path ONCE
 * (`const path = this.getPath(request, { env })`, `node_modules/hono/dist/hono-base.js`) and hands that same
 * string to BOTH `router.match(method, path)` and the `Context`, so the segment count this function sees is
 * by construction the segment count the router matched on. `getPath` decodes with `decodeURI`
 * (`tryDecodeURI`, `dist/utils/url.js`), which PRESERVES `%2F` — so `<prefix>a%2Fb` is one segment to both,
 * and the frame handler serves it under its own policy. If a hono upgrade ever switched that decoder to
 * `decodeURIComponent`, both readings would move TOGETHER (`a/b` → two segments → not exempt → the app
 * policy lands on the router's 404), which is the safe direction. The unsafe direction needs hono to stop
 * sharing that one string, or an app-level `getPath` OPTION overriding it — we set neither, and
 * `tests/server/entry/http/security-headers.test.ts` pins the observable so a regression is loud.
 */
function servesOwnPolicy(path: string): boolean {
  return OWN_POLICY_DOC_PREFIXES.some((prefix) => {
    if (!path.startsWith(prefix)) {
      return false;
    }
    const id = path.slice(prefix.length);
    return id.length > 0 && !id.includes("/");
  });
}

/** The header {@link securityHeaders} reads to decide whether an exempt path's response actually came from
 *  its own-policy handler. `Headers.has` is case-insensitive, so a differently-cased writer still counts. */
const OWN_POLICY_HEADER = "Content-Security-Policy";

/** The spent downstream handed to `hono/secure-headers` when the response ALREADY exists — it awaits its
 *  `next` before setting headers, so a resolved no-op makes it a pure header write. */
const RESPONSE_ALREADY_PRODUCED: Next = () => Promise.resolve();

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

/** One fully-formed policy per (dev × allowExternalMedia × trustworthy origin) arm — never a partially-mutated
 *  directive list. */
function policy(opts: { readonly dev: boolean; readonly external: boolean; readonly trustworthy: boolean }): MiddlewareHandler {
  const mediaHosts = opts.external ? [HTTPS] : [];
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: [SELF],
      // `'wasm-unsafe-eval'` — THE ONE APP-CSP DELTA the plugin UI plane asks for (seam
      // 10), added deliberately and reviewed as its own change.
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
    // A browser ignores both on an origin it does not trust (plain http to a LAN name or address) and logs an error
    // on every page for each, so they go out only where they take effect.
    crossOriginOpenerPolicy: opts.trustworthy ? "same-origin" : false,
    originAgentCluster: opts.trustworthy,
  });
}

// A potentially trustworthy origin as a browser judges it: https (asserted by a trusted proxy), or a loopback host.
function trustworthyOrigin(c: Context): boolean {
  return isLoopbackHost(new URL(c.req.url).hostname) || requestTransport(c) === "https";
}

/**
 * THE STEP-ASIDE IS CONDITIONAL ON THE EXEMPT HANDLER HAVING RUN (#1594). An exempt PATH is not a promise
 * that a frame handler produced the response: the ingress IP-allowlist refuses with a bare
 * `c.body(null, 403)` above these routes (`infra/network/ingress.ts`), each document route's own
 * unauthenticated arm returns a bare 401, and a wrong-METHOD request to a real document path routes to
 * nothing at all. Under an unconditional step-aside every one of those went out with NO CSP, no
 * `X-Frame-Options` and no `nosniff` — the same unpoliced-response class #1409 closed for the descendant
 * path, on responses no frame handler ever touched.
 *
 * "Did the exempt handler run" is read off the RESPONSE — does it already carry a policy? — and NOT off a
 * context flag the handlers would have to set: a flag is a coupled site a new frame route can forget, and
 * worse, it can be set by a handler that then fails to write the headers it promised. The response read
 * cannot lie, and it fails closed in both directions: no policy present ⇒ the app policy lands; a frame
 * handler that ever stopped writing its own CSP gets the app policy (a loudly refused embed) rather than
 * no policy at all (silence).
 *
 * ERROR PATHS, measured rather than reasoned (security review 2026-09-05, #1594 / #1615): a handler that
 * throws an `Error` is caught by hono's `compose()` at THAT handler's own dispatch frame, which runs
 * `app.onError` there and assigns `context.res` — so this middleware's `await next()` resolves normally and
 * the post-`next()` write below DOES reach the 500 (fully policied). The NON-`Error` throw that used to
 * escape it (`compose()`'s `err instanceof Error && onError` predicate fails, the value is rethrown past
 * every middleware, the adapter's own 500 goes out bare) is closed by {@link normalizeThrownErrors}, which
 * `entry/app.ts` mounts immediately INSIDE this middleware. There is no remaining un-policied error path
 * below that mount.
 */
export function securityHeaders(opts: SecurityHeadersOptions): MiddlewareHandler {
  // Every arm is built ONCE at wiring time; the per-request work is two boolean reads + a dispatch.
  const arms = {
    trusted: { blocked: policy({ dev: opts.dev, external: false, trustworthy: true }), allowed: policy({ dev: opts.dev, external: true, trustworthy: true }) },
    untrusted: {
      blocked: policy({ dev: opts.dev, external: false, trustworthy: false }),
      allowed: policy({ dev: opts.dev, external: true, trustworthy: false }),
    },
  };
  const appPolicy = (c: Context): MiddlewareHandler => {
    const arm = trustworthyOrigin(c) ? arms.trusted : arms.untrusted;
    return opts.allowExternalMedia() ? arm.allowed : arm.blocked;
  };
  return async (c, next) => {
    if (!servesOwnPolicy(c.req.path)) {
      await appPolicy(c)(c, next);
      return;
    }
    await next();
    if (!c.res.headers.has(OWN_POLICY_HEADER)) {
      // `hono/secure-headers` awaits its `next` and then `.set()`s onto `c.res`, so handing it a spent
      // chain writes the app headers onto the already-produced response without re-running anything.
      await appPolicy(c)(c, RESPONSE_ALREADY_PRODUCED);
    }
  };
}

/** The normalised message. It names the closed `typeof` vocabulary and NEVER the value — the value itself
 *  is untyped and may be anything, so it rides as `cause` (diagnostics) and never as text we assemble. */
const NON_ERROR_THROWN = "a non-Error value was thrown; normalised so app.onError can police the response: typeof ";

/**
 * MAKE EVERY FAILURE REACH THE POLICY WRITER (#1761). hono's `compose()` routes a throw to `app.onError`
 * only when `err instanceof Error` (`node_modules/hono/dist/compose.js`); any other thrown value is
 * rethrown out of every dispatch frame, out of `app.fetch`, and answered by the ADAPTER — a 500 with no
 * CSP, no `X-Frame-Options`, no `nosniff`, no `X-Request-Id`, and no entry in the observability ring
 * (the #1479 class, for the non-`Error` half). This middleware converts such a value into an `Error` so
 * the normal error path runs.
 *
 * THE MOUNT POSITION IS THE FIX, not the conversion. `compose()` catches at the frame that throws, and the
 * `onError` result is assigned there — so every middleware OUTSIDE that frame sees `await next()` resolve
 * and gets to run its post-`next()` write, while everything INSIDE has already unwound. Converting here
 * means `onError` runs at THIS frame, which {@link securityHeaders} still encloses: its header write lands
 * on the 500. Mounted the other way round — normalising ABOVE the header middleware — `onError` would run
 * at a frame the writer no longer encloses and the bare 500 would ship exactly as before.
 *
 * So it is mounted ONCE PER POST-`next()` WRITER, and `entry/app.ts` (which owns the order) states the pair:
 * immediately inside `securityHeaders`, and again immediately inside `observability` — otherwise the 500
 * this makes possible would carry the headers but no `X-Request-Id` and no request-ring entry.
 *
 * AN `Error` PASSES THROUGH UNTOUCHED (same instance, not re-wrapped): `app.onError`'s classifiers and the
 * observability handler read the thrown error's identity, so a blanket wrap would change every existing
 * error path. This only ever converts what would otherwise have escaped unhandled.
 *
 * DISCLOSURE: the response is unchanged — the fixed 500 text `app.onError` already returns, with no echo of
 * the thrown value. The value reaches only the same host-gated sinks an `Error`'s own message already does
 * (the pino line + the trace's exception event), as `cause`.
 */
export function normalizeThrownErrors(): MiddlewareHandler {
  return async (_c, next) => {
    try {
      await next();
    } catch (thrown) {
      if (thrown instanceof Error) {
        throw thrown;
      }
      throw new Error(`${NON_ERROR_THROWN}${typeof thrown}`, { cause: thrown });
    }
  };
}
