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
//     script-DEAD — it runs the one hash-pinned height script (which posts to itself and does nothing) —
//     but every CARD-authored script stays refused, by hash, in a frame and at top level alike.
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
//   • LAB ARM — the same probe with `script-src 'unsafe-inline'` (the leg-3 proposal, built in the test, NOT
//     here): card code RUNS (positive control: it stamps the body) and STILL reaches no navigation —
//     `top.location` and `window.open` die on the sandbox, and `location.href` off-origin dies on the app's
//     `default-src 'self'`, exactly as the script-free link does. Chromium leaves the refused frame at an
//     empty `about:blank`.
// CONSEQUENCE for leg 3: granting card-authored scripts adds NO navigation reach a static card does not
// already have. The belt is the APP document's CSP, so the residual to state is that a deployment which
// ever widens the app policy's frame-src (or serves a card frame from a page with a looser policy) loses
// this control for BOTH postures at once.
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
 * TIER-B TRUST REVIEW, 2026-08-16 (security-executor pass, #91), ARM B — the MINIMAL grant:
 *   • `document` (routed) = `allow-scripts`, paired in the SAME policy with `script-src` naming ONE hash:
 *     {@link CARD_FRAME_HEIGHT_SCRIPT}. Our measurement script runs; a card-authored `<script>`, `on*=`
 *     handler or `javascript:` URL hashes differently and is refused — the card author gains NOTHING. No
 *     `'unsafe-inline'`, no `'unsafe-hashes'`, no `'unsafe-eval'`, no host source, and still no
 *     `connect-src`, so the one capability bought is "measure yourself and tell the parent".
 *   • `meta` (srcdoc floor) = EMPTY, every restriction on. A srcdoc document also inherits the app CSP
 *     (`script-src 'self'`), so a hash we do not also add to the APP policy could never match there —
 *     granting the flag would buy nothing and spend a belt. The floor stays script-dead; that arm keeps
 *     the fixed pre-measurement height and that is the accepted outcome (#91's defect is routed cards).
 * NEVER `allow-same-origin` on either arm (that combo lets the frame reach into the app origin and lets it
 * remove its own sandbox). The FULL artifact-sandbox posture — `script-src 'unsafe-inline'`, i.e. running
 * model-authored card JS, the §12.2 "doored, not walled" trusted-card interactivity — is NOT granted here
 * and still owes its own security pass.
 */
export const CARD_FRAME_SANDBOX = { document: "allow-scripts", meta: "" } as const satisfies Record<CardFrameDelivery, string>;

/**
 * The card document's SCRIPT POSTURE — the per-document selection seam (#111 leg 1), and the ONE row leg 3's
 * security pass has to move to grant interactive cards.
 *
 *   • `static` — only OUR hash-pinned measurement script may execute. Every card gets this today, and it is
 *     the DEFAULT for every card nobody opted in (an imported card included).
 *   • `interactive` — the host opted THIS character's cards into running their own scripts
 *     — the TOP RUNG of the one ordered html-trust ladder (`RenderPolicy.htmlTrust`, contracts/chat:
 *     `untrusted` then `trusted` then `interactive`), resolved off the `characters.interactive_html` beside
 *     `trust_html`. The same per-character host consent D44 uses to grant the tierB sandbox, one rung up;
 *     interactive IMPLIES trusted by construction, so a frame in this posture always has the `data:` door.
 *
 * **NO GRANT EXISTS YET.** `CARD_FRAME_SCRIPT_SOURCES` below gives both arms the SAME single hash, so an
 * interactive-flagged card is byte-identical to a static one on the wire: the SELECTION is live and
 * observable (the mint echoes it as `granted.interactive`), the CAPABILITY is not. That split is the
 * program's whole shape — #91's tier-B pass declined to ride a product-scale capability grant on a layout
 * fix, so the grant is reserved for a second security-executor pass which owns the `interactive` row and
 * nothing else in this file.
 *
 * The sandbox grant does NOT vary by posture: the reviewed target is still `allow-scripts` alone (never
 * `allow-same-origin`, never `allow-top-navigation`/`allow-forms`/`allow-popups`) and only `script-src`
 * moves — so {@link CARD_FRAME_SANDBOX} stays keyed by delivery alone.
 *
 * TRUTH-REPAIR (2026-08-16, this lane): #110/#111 both say the per-card knob "is NOT BUILT" and name
 * `config.features.immersiveHtmlInteractive` as the thing to build. That knob EXISTS and is something else:
 * `contracts/rpg/config.ts` (`default(true)`) drives which TEACHING prose slot the rpg reminder emits
 * (`domain/rpg/substrate/reminder.ts` — `rpg.card.askInteractive` vs `rpg.card.askStatic`). It is per-GAME,
 * defaults ON, shapes the PROMPT, and the program spec that introduced it explicitly REJECTED gating the
 * render on it ("a stored interactive card would break on a later toggle-off"). So it could not be the
 * selector for a script grant: it does not exist for a non-game chat, it says nothing about an imported
 * card, and a prompt-shaping default-on switch is not a security consent. The knob built here is the one
 * #110's SYMPTOM asks for — per-card, default OFF, homed with the render-trust consent it belongs to — and
 * the rpg ask-knob is untouched.
 *
 * OPEN FOR LEG 3 (recorded here rather than built, because a kill-switch that gates nothing is
 * scaffolding): there is NO deployment-tier ceiling for the top rung. It resolves from the per-character
 * override ALONE ({@link https://github.com/Inktomi93/orbweaver/issues/111}) while the render step below it
 * and the external-media axis each have an AppSettings tier. Whether a fleet-wide off switch is a
 * precondition of the grant is the security pass's call.
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

/** The `script-src` sources per POSTURE, `document` delivery only (the `meta` floor names none — a srcdoc
 *  document inherits the app's `script-src 'self'`, so a hash we did not also add to the APP policy could
 *  never match there). BOTH ROWS ARE THE SAME TODAY, deliberately — see {@link CARD_FRAME_POSTURES}. Leg 3
 *  moves the `interactive` row and only that row. */
const CARD_FRAME_SCRIPT_SOURCES = {
  static: [CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH],
  interactive: [CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH],
} as const satisfies Record<CardFramePosture, readonly string[]>;

/** The height channel's clamp. The message is UNTRUSTED input from a document whose body is model-authored,
 *  so the number it reports is an assertion, not a measurement we made.
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
  /** The DOORWAY: `data:` on img/media, granted only by a per-character `renderPolicy.trustHtml` opt-in (the
   *  same host consent D44 uses to grant the tierB sandbox). Expressible ONLY on the `document` delivery —
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
}

const CUSTOM_PROP_KEY = /^--[\w-]+$/u;
// A theme var carrying CSS-escape chars could break out of the <style> — drop it (per-field, never a
// whole-object reject: one bad token must not blank the card's whole surface/text theming).
const CSS_ESCAPE = /[<>{}]/u;
// A font-family LIST shape check (`isSafeColor` is color-only): letters/digits/space/comma/hyphen/quotes
// only, so a hostile custom-theme `--font-sans` cannot break out of the body rule.
const FONT_FAMILY_LIST = /^[\w ,'"-]{1,120}$/u;

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
 * ({@link CARD_FRAME_POSTURES}) — the only place scripts are nameable at all, and today one hash on both
 * arms. The META arm names none (and takes no posture), so `default-src 'none'` keeps covering script-src
 * there. The posture is REQUIRED rather than defaulted: a call site that has not decided which document it
 * is building must say `"static"` out loud, not inherit it from an argument it forgot.
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
  const themeCss = themeVarsBlock(clampCardFrameThemeTokens(content.themeTokens));
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
