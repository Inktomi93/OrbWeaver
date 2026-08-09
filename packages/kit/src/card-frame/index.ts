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
//     `sandbox=` attribute. A direct top-level navigation to the card URL is then ALSO opaque-origin and
//     script-dead (measured: `window.origin === null`, the inline script never ran). Without it the same
//     navigation lands model-authored HTML in the app's own origin. It is not expressible in `<meta>`
//     (the spec ignores `sandbox`/`frame-ancestors`/`report-uri` there), which is the second reason the
//     routed arm is the primary and srcdoc is the floor.
//
// ── THE COOKIE CEILING (measured in the same probe; corrects a claim that stood in two docs) ──────────────
// An opaque-origin document's same-origin subresource fetch is `Sec-Fetch-Site: cross-site`, so a
// `SameSite=Lax` cookie is WITHHELD. Our session cookie is `SameSite=Lax` (`entry/http/auth-routes.ts`), and
// `/api/blob/<hash>` is session-gated — so an `<img src="/api/blob/…">` inside a card frame 401s and paints
// nothing, on the srcdoc arm TODAY and on the routed arm equally. `'self'` is kept on the media directives
// for parity with the pre-existing policy (dropping it would be an unrequested tightening), but nobody should
// read it as "card images work from the CAS": under the current cookie policy they cannot, and the model
// cannot author a blob hash anyway. `data:` on a trusted card is the path that actually paints.

import { isSafeColor } from "#safe-color";

/** The sandbox directive's value. EMPTY = every restriction on (no scripts, no forms, no popups, no
 *  top-navigation, opaque origin). SECURITY-GATED, and the twin of `@orb/ui`'s `SANDBOX_ATTR`: the ratified
 *  artifact-sandbox flip sets this to `allow-scripts` AND adds `script-src 'unsafe-inline'` below, in ONE
 *  review — never one without the other, and NEVER `allow-same-origin` (that combo lets the frame read us). */
const SANDBOX_VALUE = "";

/** Where the policy is delivered. `document` = a `Content-Security-Policy` RESPONSE HEADER (the routed arm —
 *  can express `sandbox` + `frame-ancestors`, and is not intersected with the embedder's policy).
 *  `meta` = an in-document `<meta http-equiv>` (the srcdoc floor — those two directives are ignored there,
 *  so emitting them would be dead config that teaches the next reader a lie). */
export const CARD_FRAME_DELIVERIES = ["document", "meta"] as const;
export type CardFrameDelivery = (typeof CARD_FRAME_DELIVERIES)[number];

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
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
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
 * including `script-src` and `connect-src`, so a card can style itself and can never fetch, phone home, or
 * execute. `form-action`/`base-uri` are named EXPLICITLY because neither falls back to `default-src` (a
 * card `<form action="https://evil">` and a `<base href>` retarget were both expressible under the old
 * policy). `style-src 'unsafe-inline'` is the card's whole point — the sandbox, not a nonce, is the guard.
 */
export function buildCardFrameCsp(policy: CardFrameMediaPolicy, delivery: CardFrameDelivery): string {
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
  // `sandbox` FIRST so a reader sees the isolation before the allowances; `frame-ancestors 'self'` says only
  // our own origin may embed the card document (and, measured, supersedes any X-Frame-Options on the same
  // response — so the route owns its framing verdict outright).
  return [`sandbox ${SANDBOX_VALUE}`.trim(), ...directives, `frame-ancestors 'self'`].join("; ");
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
 * The clamps run HERE, on every call, regardless of what the caller already did — the server's call is a
 * trust boundary and must not inherit the client's word for it.
 */
export function buildCardFrameDocument(content: CardFrameContent, metaCsp?: string): string {
  const themeCss = themeVarsBlock(clampCardFrameThemeTokens(content.themeTokens));
  const baseBody = baseBodyBlock(clampCardFrameFontFamily(content.fontFamily));
  const meta = metaCsp === undefined ? "" : `<meta http-equiv="Content-Security-Policy" content="${metaCsp}">`;
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    meta,
    `<style>${themeCss} ${baseBody} ${content.css ?? ""}</style>`,
    "</head><body>",
    content.html,
    "</body></html>",
  ].join("");
}
