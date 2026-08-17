// The Tier-B iframe SRCDOC arm — the frame's FLOOR delivery. The document body and the policy string are
// built by the ONE engine in `@orb/kit/card-frame` (read its header: it carries the measured CSP-inheritance
// / opaque-origin / cookie facts this whole surface rests on). Nothing about the policy is decided here.
//
// FLOOR, not fallback-for-now: a `srcdoc` document inherits the EMBEDDING document's CSP on top of its own
// meta policy, so this arm can only ever be TIGHTER than the app's — it cannot express the per-trust
// `img-src` widening the routed arm exists for, and it cannot carry `sandbox`/`frame-ancestors` (ignored in
// `<meta>` by spec). It is what renders when no routed handle is available: a story/CT mount, a mint that
// has not resolved yet, an offline or failed mint. Delivering the floor is always safe; delivering nothing
// would be a blank card.
//
// THE SANDBOX ATTRIBUTE MOVED (2026-08-16 tier-B pass, #91): the grant is per-DELIVERY now and lives with
// its CSP twin as `CARD_FRAME_SANDBOX` in `@orb/kit/card-frame` — `meta: ""` (this arm: every restriction
// on, script-dead, so it keeps the caller's fixed height and never self-measures) vs
// `document: "allow-scripts"` (the routed arm, paired with a one-hash `script-src`). Two constants in two
// packages that a comment asked a reviewer to keep in sync are now one value indexed by arm. Read that
// record for the review; nothing about the grant is decided here either.

import { buildCardFrameCsp, buildCardFrameDocument, CARD_FRAME_SAFE_FLOOR } from "@orb/kit/card-frame";

/** Assembles the full sandboxed document for the `srcdoc` arm — the kit document plus the kit `meta` policy.
 *  `allowExternalMedia` is the only variable part reachable here (`data:` is not expressible on this arm —
 *  the embedder's `img-src` is intersected in); absent ⇒ blocked (fail closed). */
export function buildSrcDoc(params: {
  readonly html: string;
  readonly css: string | undefined;
  readonly themeTokens: Readonly<Record<string, string>> | undefined;
  readonly fontFamily: string | undefined;
  /** The resolved external-media verdict for the row this card belongs to. Absent ⇒ blocked (fail closed). */
  readonly allowExternalMedia?: boolean | undefined;
}): string {
  const policy = { ...CARD_FRAME_SAFE_FLOOR, allowExternalMedia: params.allowExternalMedia === true };
  return buildCardFrameDocument(
    { html: params.html, css: params.css, themeTokens: params.themeTokens, fontFamily: params.fontFamily },
    // `static`, always: the floor is script-dead by construction (sandbox `""` + an inherited
    // `script-src 'self'`), so the interactive posture is not expressible on this arm — passing it would be
    // a directive that can never match, the same lie as `data:` here (#111 leg 1).
    buildCardFrameCsp(policy, "meta", "static"),
  );
}
