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
  if (w !== undefined && h !== undefined && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { width: w, height: h };
  }
  return null;
}

/**
 * Split a `@<idx>` --pages tab suffix off a flag token: `--click@1` → `{ flag: "--click", page: 1 }`,
 * `--eval` → `{ flag: "--eval", page: 0 }`. Only a `@` followed by DIGITS counts — a bare `@` or a
 * non-numeric tail leaves the token untouched (page 0), so a value that happens to contain `@` is never
 * mistaken for a page prefix. Digits-only keeps the regex ASCII (no `/u` needed).
 */
const PAGE_SUFFIX_RE = /^(--[a-z-]+)@(\d+)$/;
export function splitPageSuffix(tok: string): { flag: string; page: number } {
  const m = PAGE_SUFFIX_RE.exec(tok);
  if (m?.[1] !== undefined && m[2] !== undefined) {
    return { flag: m[1], page: Number(m[2]) };
  }
  return { flag: tok, page: 0 };
}

/** The decoded `--goto` target: which `__orb.nav` method reaches it + the argument to pass. A bare id is a
 *  rail SECTION; `settings:<cat>` opens Settings on a category; `modal:<slot>` opens a rail modal. */
export type GotoTarget =
  | { readonly method: "section"; readonly arg: string }
  | { readonly method: "openSettings"; readonly arg: string }
  | { readonly method: "openModal"; readonly arg: string };

const SETTINGS_PREFIX = "settings:";
const MODAL_PREFIX = "modal:";

/** Parse a `--goto` target string into the nav method + argument. Pure (the same decode snap injects
 *  in-page), so it's unit-testable in Node without a browser. */
export function parseGotoTarget(target: string): GotoTarget {
  if (target.startsWith(SETTINGS_PREFIX)) {
    return { method: "openSettings", arg: target.slice(SETTINGS_PREFIX.length) };
  }
  if (target.startsWith(MODAL_PREFIX)) {
    return { method: "openModal", arg: target.slice(MODAL_PREFIX.length) };
  }
  return { method: "section", arg: target };
}
