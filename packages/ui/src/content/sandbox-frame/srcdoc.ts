// The Tier-B iframe security config — the exact sandbox + CSP that make the iframe a real boundary.

/**
 * NO `allow-same-origin` (null origin — no cookies/localStorage/DOM access), NO `allow-scripts`
 * (doored, not walled), no `allow-popups`/`allow-forms`. Owned in this ONE place.
 *
 * SECURITY-GATED: `allow-scripts` enablement + its tierB trust review is owned by a security-executor
 * pass before merge (parity-plus §4.2 / §10 flag #1). The ratified target posture is the artifact
 * sandbox — `SANDBOX_ATTR = "allow-scripts"` (NEVER paired with `allow-same-origin`: that combo lets the
 * frame read the app origin) plus `script-src 'unsafe-inline'` added to the CSP below (still no
 * `connect-src`, so a script can compute/animate but never phone home). Until that pass clears, scripts
 * stay OFF (the safe default) — the flip is this one constant + the one CSP directive, nothing else.
 */
export const SANDBOX_ATTR = "";

/**
 * `default-src 'none'` denies everything by default; no `connect-src` so the frame can't fetch/exfil.
 * SECURITY-GATED (see `SANDBOX_ATTR`): the scripts flip adds `script-src 'unsafe-inline'` HERE, in the
 * same review that enables the sandbox attribute — never one without the other.
 *
 * `allowExternalMedia` is the ONLY variable part, and it mirrors the app-tier "Block external media"
 * setting exactly as the document CSP does (`server/entry/http/security-headers.ts`): `https:` on
 * `img-src`/`media-src`, never `http:`, never any other directive.
 *
 * BOTH policies must allow it for a card image to paint. A `srcdoc` frame is a LOCAL-scheme document, so
 * it INHERITS the embedding document's CSP on top of this meta policy (verified in Chromium: an external
 * image inside `sandbox=""` `srcdoc` logs two violations — one against the parent policy at `about:srcdoc`,
 * one against this one). `'self'` still resolves to the EMBEDDER's origin despite the frame's opaque
 * origin, which is why same-origin `/api/blob` card images work today.
 */
function csp(allowExternalMedia: boolean): string {
  const media = allowExternalMedia ? "'self' https:" : "'self'";
  return `default-src 'none'; img-src ${media}; media-src ${media}; style-src 'unsafe-inline'; font-src 'self'`;
}

// A theme var carrying CSS-escape chars could break out of the <style> — drop it (the caller already clamps).
const CSS_ESCAPE = /[<>{}]/u;

function themeVarsBlock(themeTokens: Readonly<Record<string, string>> | undefined): string {
  if (themeTokens === undefined) {
    return "";
  }
  const decls = Object.entries(themeTokens)
    .filter(([key, value]) => key.startsWith("--") && !CSS_ESCAPE.test(`${key}${value}`))
    .map(([key, value]) => `${key}: ${value};`)
    .join(" ");
  return `:root { ${decls} }`;
}

// The base body rule so an UNSTYLED model card lands IN the app theme instead of browser-default
// white/serif. It USES the injected surface/text vars (`--sandbox-bg`/`--sandbox-fg`, resolved from
// `color.card`/`color.card-foreground` by useSandboxTheme) — so an under-filled frame is a dark themed
// surface, not a white slab. `fontFamily` is a pre-validated font-list (font-list shape check upstream);
// the `sans-serif` fallback guarantees a sans face (never serif) even when the font var is dropped. The
// card's own params.css still layers on top of this.
function baseBodyBlock(fontFamily: string | undefined): string {
  const font = fontFamily === undefined ? "sans-serif" : `${fontFamily}, sans-serif`;
  return `body { margin: 0; padding: 0; background: var(--sandbox-bg); color: var(--sandbox-fg); font-family: ${font}; }`;
}

/** Assembles the full sandboxed document — a null-origin, no-scripts frame that can style itself but not reach us. */
export function buildSrcDoc(params: {
  readonly html: string;
  readonly css: string | undefined;
  readonly themeTokens: Readonly<Record<string, string>> | undefined;
  readonly fontFamily: string | undefined;
  /** The resolved external-media verdict for the row this card belongs to. Absent ⇒ blocked (fail closed). */
  readonly allowExternalMedia?: boolean | undefined;
}): string {
  const themeCss = themeVarsBlock(params.themeTokens);
  const baseBody = baseBodyBlock(params.fontFamily);
  const cardCss = params.css ?? "";
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${csp(params.allowExternalMedia === true)}">`,
    `<style>${themeCss} ${baseBody} ${cardCss}</style>`,
    "</head><body>",
    params.html,
    "</body></html>",
  ].join("");
}
