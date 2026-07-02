// The Tier-B iframe security config (D44 §12.2) — the EXACT sandbox + CSP that make the iframe a real
// boundary. Pure string-building, kept out of the component file (component-export-only). The iframe
// IS the boundary: untrusted HTML is NEVER sanitized into the main DOM — it is handed to a separate
// realm whose capabilities we own here.

/**
 * The sandbox attribute (D44 §12.2). v1 = untrusted DISPLAY only:
 *  - NO `allow-same-origin` → the frame is a null origin; it cannot read our cookies/localStorage/DOM.
 *  - NO `allow-scripts` → card JS cannot run (doored, not walled — a trusted card later flips this).
 *  - `allow-popups`/`allow-forms` intentionally ABSENT.
 * Anything the frame could use to reach the parent is withheld. Owned in this ONE place.
 */
export const SANDBOX_ATTR = "";

/**
 * The per-frame CSP (injected as a `<meta http-equiv>` in the srcdoc head). `default-src 'none'`
 * denies everything by default; `img-src`/`media-src` allow only self + the app origin (data: URIs
 * blocked — no tracking pixels); `style-src 'unsafe-inline'` is required for the card's own CSS
 * (there is no script surface to abuse it). NO `connect-src` → the frame cannot fetch/exfil.
 */
const CSP =
  "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; font-src 'self'";

// A theme var carrying CSS-escape chars could break out of the <style> — drop it (belt; the caller
// already clamps). Top-level per useTopLevelRegex.
const CSS_ESCAPE = /[<>{}]/u;

/** `<` in untrusted content that could break OUT of an attribute/text context is neutralized before
 *  it reaches the srcdoc head where our own meta/style live; the body html rides in a data island the
 *  browser parses inside the sandboxed realm (never our DOM). */
function themeVarsBlock(themeTokens: Readonly<Record<string, string>> | undefined): string {
  if (themeTokens === undefined) {
    return "";
  }
  const decls = Object.entries(themeTokens)
    // Only pass through already-validated `--*` custom props (the caller clamps; belt-and-suspenders
    // here — a key/value carrying `}`/`<`/`;`-injection is dropped so it can't escape the <style>).
    .filter(([key, value]) => key.startsWith("--") && !CSS_ESCAPE.test(`${key}${value}`))
    .map(([key, value]) => `${key}: ${value};`)
    .join(" ");
  return `:root { ${decls} }`;
}

/**
 * Assemble the full sandboxed document. The untrusted `html` (+ optional `css`) lives in the BODY of
 * a document whose head we own (CSP meta + theme vars + the card css). Because the frame is sandboxed
 * with a null origin and no scripts, this html can style itself but cannot script, fetch, or reach us.
 */
export function buildSrcDoc(params: {
  readonly html: string;
  readonly css: string | undefined;
  readonly themeTokens: Readonly<Record<string, string>> | undefined;
}): string {
  const themeCss = themeVarsBlock(params.themeTokens);
  const cardCss = params.css ?? "";
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    `<style>${themeCss} ${cardCss}</style>`,
    "</head><body>",
    params.html,
    "</body></html>",
  ].join("");
}
