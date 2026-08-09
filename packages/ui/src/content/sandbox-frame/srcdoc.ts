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

import { buildCardFrameCsp, buildCardFrameDocument, CARD_FRAME_SAFE_FLOOR } from "@orb/kit/card-frame";

/**
 * NO `allow-same-origin` (null origin — no cookies/localStorage/DOM access), NO `allow-scripts`
 * (doored, not walled), no `allow-popups`/`allow-forms`. Owned in this ONE place for the ATTRIBUTE; the
 * routed arm's twin is the CSP `sandbox` directive in `@orb/kit/card-frame` (both flip together).
 *
 * SECURITY-GATED: `allow-scripts` enablement + its tierB trust review is owned by a security-executor
 * pass before merge (parity-plus §4.2 / §10 flag #1). The ratified target posture is the artifact
 * sandbox — `SANDBOX_ATTR = "allow-scripts"` (NEVER paired with `allow-same-origin`: that combo lets the
 * frame read the app origin) plus `script-src 'unsafe-inline'` added to the kit CSP builder (still no
 * `connect-src`, so a script can compute/animate but never phone home). Until that pass clears, scripts
 * stay OFF (the safe default) — the flip is this one constant + kit's `SANDBOX_VALUE` + the one directive.
 */
export const SANDBOX_ATTR = "";

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
    buildCardFrameCsp(policy, "meta"),
  );
}
