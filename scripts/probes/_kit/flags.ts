// Shared argv idioms for the browser probes. Each probe owns its own flag table + parse
// loop; _kit only centralizes the `key=value` splits (FIRST vs LAST `=` — not
// interchangeable, see below) and the "WxH" viewport parse.

export type EqSplit = { readonly head: string; readonly tail: string };

export type Viewport = { readonly width: number; readonly height: number };

/**
 * Split on the LAST `=` — for `--fill "sel=value"` / `--key "sel=KeyName"`: SELECTORS
 * contain `=` (`[data-testid=x] input`), values rarely do. First-`=` splitting silently
 * mangles attribute selectors.
 */
export function splitLastEq(raw: string): EqSplit {
  const eq = raw.lastIndexOf("=");
  if (eq === -1) {
    return { head: raw, tail: "" };
  }
  return { head: raw.slice(0, eq), tail: raw.slice(eq + 1) };
}

/**
 * Split on the FIRST `=` — for `--ls "key={json}"`: localStorage KEYS never contain `=`,
 * but persisted-store VALUES are JSON that often does. Mirror-image constraint of
 * `splitLastEq`. Returns null when there is no `=` or the key would be empty.
 */
export function splitFirstEq(raw: string): EqSplit | null {
  const eq = raw.indexOf("=");
  if (eq <= 0) {
    return null;
  }
  return { head: raw.slice(0, eq), tail: raw.slice(eq + 1) };
}

/** Parse `--viewport "WxH"` (e.g. "1920x1080"). Null on anything malformed or non-positive. */
export function parseViewport(raw: string): Viewport | null {
  const [w, h] = raw.split("x").map(Number);
  if (w && h && Number.isFinite(w) && Number.isFinite(h)) {
    return { width: w, height: h };
  }
  return null;
}
