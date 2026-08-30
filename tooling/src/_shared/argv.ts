// Shared argv idioms for the browser probes. Each probe owns its own flag table + parse
// loop; _kit only centralizes the `key=value` splits (FIRST vs LAST `=` — not
// interchangeable, see below) and the "WxH" viewport parse.

export interface EqSplit {
  readonly head: string;
  readonly tail: string;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

const VIEWPORT_RE = /^([0-9]+)x([0-9]+)$/;

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

/** What closes each span the scanner must step OVER rather than read: an attribute selector's brackets, a
 *  functional pseudo-class's parens, and either quote. */
const SPAN_CLOSERS: Readonly<Record<string, string>> = { "[": "]", "(": ")", '"': '"', "'": "'" };

/** Index of the character closing the span that opens at `open`, or the end of the string when it is
 *  unterminated (a malformed selector is the caller's refusal to make, not this scanner's). Quotes nest
 *  inside brackets — `[data-x="a]b"]` closes at the LAST bracket, not the one inside the string. */
function spanEnd(raw: string, open: number): number {
  const closer = SPAN_CLOSERS[raw[open] ?? ""];
  if (closer === undefined) {
    return open;
  }
  for (let i = open + 1; i < raw.length; i += 1) {
    const ch = raw[i] ?? "";
    if (ch === closer) {
      return i;
    }
    if (ch === '"' || ch === "'") {
      i = spanEnd(raw, i);
    }
  }
  return raw.length;
}

/** Playwright's built-in SELECTOR ENGINES. The `engine=body` form puts an `=` INSIDE the selector, so the
 *  pair split must step over it — `--fill 'role=textbox[name="Content"]=hello'` is a selector plus a
 *  value, not `role` plus everything else (#826: `ARG ERROR --fill selector "role" can never match`, on a
 *  live review, whose only workaround was `:nth-match(textarea, 2)=value`).
 *
 *  A CLOSED SET, deliberately: the shape regex `^[A-Za-z_][\w-]*=` also matches `input=hello`, so a
 *  prefix-shaped test would cut the ordinary CSS pair flag in half — the exact mirror of the bug. */
const SELECTOR_ENGINES: ReadonlySet<string> = new Set([
  "css",
  "data-test",
  "data-test-id",
  "data-testid",
  "id",
  "nth",
  "role",
  "text",
  "visible",
  "xpath",
  "_react",
  "_vue",
]);

/** Whether the `=` at `at` is the one that ENDS an engine name — the head of the string, or a part of a
 *  `>>` chain (`role=button >> nth=0`). Those belong to the selector; every other top-level `=` splits. */
function isEngineNameEq(raw: string, at: number): boolean {
  const name = /(?:^|\s|>>)\s*([A-Za-z_][\w-]*)$/u.exec(raw.slice(0, at))?.[1];
  return name !== undefined && SELECTOR_ENGINES.has(name);
}

/** Index of the first `=` outside every bracket, paren, quoted string and engine prefix — or null when
 *  there is none. */
function topLevelEqIndex(raw: string): number | null {
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i] ?? "";
    if (ch === "=" && !isEngineNameEq(raw, i)) {
      return i;
    }
    if (SPAN_CLOSERS[ch] !== undefined) {
      i = spanEnd(raw, i);
    }
  }
  return null;
}

/** The SELECTOR-headed pair split: the first `=` that is not inside an attribute selector or a quoted
 *  string (`--fill '[data-testid=cast-name]=hello'`).
 *
 *  THE #686 RULING SURVIVES — ITS INPUT CHANGED (#816). `--fill` splits on the FIRST `=` because its
 *  VALUE is a JS literal that routinely contains one (`--fill '[data-composer]=const a = 1;'`), and that
 *  is still exactly what this does. What the ruling assumed was that a SELECTOR never carries an `=`;
 *  an attribute selector does, so the plain first-`=` split cut `[data-testid` off from `cast-name]` and
 *  made every attribute selector unusable (paid live: a review had to tag its input through `--eval`
 *  first — docs/reviews/side-eye/2026-08-29-saved-casts-rules.md §9). Depth-aware, so both hold at once.
 *
 *  THE SAME RULING, ITS INPUT CHANGED AGAIN (#826): a Playwright ENGINE prefix (`role=`, `text=`, …) is
 *  also part of the selector, so the scan steps over the `=` that ends an engine name. Consequence worth
 *  knowing: `text=hello` with no second `=` now reads as a whole SELECTOR and returns null (the flag
 *  refuses "expects sel=value"), which is what the caller meant — Playwright would have read it as the
 *  text engine too.
 *
 *  Null when there is no top-level `=` or the selector would be empty — the caller's refusal, unchanged. */
export function splitSelectorEq(raw: string): EqSplit | null {
  const at = topLevelEqIndex(raw);
  return at === null || at === 0 ? null : { head: raw.slice(0, at), tail: raw.slice(at + 1) };
}

/** Parse `--viewport "WxH"` (e.g. "1920x1080"). Null on anything malformed or non-positive. */
export function parseViewport(raw: string): Viewport | null {
  const match = VIEWPORT_RE.exec(raw);
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (Number.isSafeInteger(w) && Number.isSafeInteger(h) && w > 0 && h > 0) {
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
 *  rail SECTION; `settings:<group>` opens the Settings section on a config group (the CLI spelling kept its
 *  word when the settings modal retired into the section, #866 S1 — the bridge method is `openConfig`);
 *  `modal:<slot>` opens a rail modal. */
export type GotoTarget =
  | { readonly method: "section"; readonly arg: string }
  | { readonly method: "openConfig"; readonly arg: string }
  | { readonly method: "openModal"; readonly arg: string };

const SETTINGS_PREFIX = "settings:";
const MODAL_PREFIX = "modal:";

/** Parse a `--goto` target string into the nav method + argument. Pure (the same decode snap injects
 *  in-page), so it's unit-testable in Node without a browser. */
export function parseGotoTarget(target: string): GotoTarget {
  if (target.startsWith(SETTINGS_PREFIX)) {
    return { method: "openConfig", arg: target.slice(SETTINGS_PREFIX.length) };
  }
  if (target.startsWith(MODAL_PREFIX)) {
    return { method: "openModal", arg: target.slice(MODAL_PREFIX.length) };
  }
  return { method: "section", arg: target };
}
