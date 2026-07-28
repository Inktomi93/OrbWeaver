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

/** `default-src 'none'` denies everything by default; no `connect-src` so the frame can't fetch/exfil.
 *  SECURITY-GATED (see `SANDBOX_ATTR`): the scripts flip adds `script-src 'unsafe-inline'` HERE, in the
 *  same review that enables the sandbox attribute — never one without the other. */
const CSP = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; font-src 'self'";

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

/** Assembles the full sandboxed document — a null-origin, no-scripts frame that can style itself but not reach us. */
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
