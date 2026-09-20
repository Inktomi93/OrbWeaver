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
 * Split on the FIRST `=` — for `--local-storage "key={json}"`: localStorage KEYS never contain `=`,
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
 *  rail SECTION; `config:<group>[.<sub>[.<setting>]]` opens the Configuration section on a config group, its
 *  subcategory, and one setting LEAF (the bridge method is `openConfig`); `modal:<slot>` opens a rail modal.
 *
 *  THE PREFIX WAS `settings:` UNTIL #2447. It had kept its word when the settings modal retired into the
 *  section (#866 S1), and the owner's 2026-09-19 ruling — "settings migrated to config; settings should be
 *  gone" — took the last of that word with it: there is no settings feature, no settings modal and no
 *  Settings section, only `features/config` hosting the Configuration section. No alias and no migration
 *  door (the no-retirement-doors ruling, 2026-09-04): an unlaunched product greps its own spellings. */
export type GotoTarget =
  | { readonly method: "section"; readonly arg: string }
  | { readonly method: "openConfig"; readonly arg: string; readonly sub?: string; readonly setting?: string }
  | { readonly method: "openModal"; readonly arg: string };

const CONFIG_PREFIX = "config:";
const MODAL_PREFIX = "modal:";
/** The config address is THREE parts, verbatim the vocabulary `openConfigTo(group, sub?, setting?)` and the
 *  `/config?to=g.s.l` copy-link grammar carry (packages/client/src/state/config-link.ts). #1176 widened the
 *  bridge to the leaf; until #1639 this parser stopped at two, so a drive asking for one knob was decoded
 *  as its section and the run reported success. */
const GOTO_CONFIG_GRAMMAR = "config:<group>[.<sub>[.<setting>]]";
/** A `<word>:` head is a NAMESPACE, and only these two exist. No rail SECTION id carries a colon
 *  (`state/section-ids.ts`), so a colon that opens an unknown namespace is never a section — and letting it
 *  fall through to `section` is precisely the truncated-decode failure this parser exists to refuse: the
 *  drive would navigate somewhere else and report `ok:true`. This is the arm that catches the retired
 *  `settings:` spelling, and it catches a typo the same way — it is the GRAMMAR failing closed, not an alias
 *  table. */
const GOTO_NAMESPACE_RE = /^[a-z][a-z-]*:/u;
/** THE WHOLE TARGET GRAMMAR IN ONE HOME (#2482). Both refusals below AND `--goto`'s flag summary
 *  (`snap/ops/flags-metadata.ts`, which `pnpm snap --help` and the generated flag index both render) read
 *  this string, so the help cannot document a form the parser refuses. It did: the summary promised "a
 *  dotted settings address group.sub.setting" — the pre-#2447 `settings:` word, minus its namespace — and a
 *  lane that followed it got the SECTION arm's "unknown section … expected one of: home, chats, …", read
 *  that as "you typed it wrong" and went looking for a bug in its own address.
 *
 *  THE CODE SPANS ARE LOAD-BEARING, not decoration: the summary's only render is a table cell in the
 *  generated `.claude/skills/snap-driving/reference/flags.md`, where `[` outside a span is escaped
 *  (`snap/ops/flags-metadata.ts`'s own note). They cost a terminal refusal two backtick characters, which is
 *  the cheaper half of the trade — the alternative is a second hand-spelled copy of the grammar, which is
 *  exactly how the first one rotted. */
export const GOTO_TARGET_GRAMMAR = `a bare rail section id, \`${GOTO_CONFIG_GRAMMAR}\`, or \`${MODAL_PREFIX}<slot>\``;

/** Parse a `--goto` target string into the nav method + argument. Pure (the same decode snap injects
 *  in-page), so it's unit-testable in Node without a browser. REFUSES an address the grammar cannot spell
 *  — a truncated decode navigates SOMEWHERE ELSE and reports `ok:true`, which is the lying-instrument
 *  class the nav module exists to avoid; the throw surfaces as one NAV FAILED line and a red exit at every
 *  call site (`_shared/nav.ts`, `snap/ops/drive.ts`). `parseConfigLink`'s `rest.length > 0` refusal is the
 *  same decision on the client half. */
export function parseGotoTarget(target: string): GotoTarget {
  if (target.startsWith(CONFIG_PREFIX)) {
    const [group = "", sub, setting, ...rest] = target.slice(CONFIG_PREFIX.length).split(".");
    if (rest.length > 0) {
      throw new Error(`--goto "${target}" spells more parts than the config address ${GOTO_CONFIG_GRAMMAR}`);
    }
    if (group === "" || sub === "" || setting === "") {
      throw new Error(`--goto "${target}" names an empty address part; the config address is ${GOTO_CONFIG_GRAMMAR}`);
    }
    return { method: "openConfig", arg: group, ...(sub === undefined ? {} : { sub }), ...(setting === undefined ? {} : { setting }) };
  }
  if (target.startsWith(MODAL_PREFIX)) {
    return { method: "openModal", arg: target.slice(MODAL_PREFIX.length) };
  }
  const namespace = GOTO_NAMESPACE_RE.exec(target)?.[0];
  if (namespace !== undefined) {
    throw new Error(`--goto "${target}" opens the unknown namespace "${namespace}"; the targets are ${GOTO_TARGET_GRAMMAR}`);
  }
  // A DOTTED BARE TARGET NAMES THE GATE IT MISSED, NOT A SECTION (#2482). No rail section id contains a dot
  // (`packages/client/src/state/section-ids.ts`, pinned as text by tests/tooling/_shared/argv.test.ts —
  // tooling may not import the client package, so the lens reads the tuple's source rather than claiming the
  // property), so a dotted target is an ADDRESS whose namespace was left off. Falling through to `section`
  // handed the caller the bridge's section vocabulary — the wrong vocabulary, which reads as "that id does
  // not exist" and hides that the form itself needs a `config:` head.
  if (target.includes(".")) {
    throw new Error(
      `--goto "${target}" is a dotted address with no namespace — no rail section id contains a dot, and a config address carries its head: ${GOTO_CONFIG_GRAMMAR}. The targets are ${GOTO_TARGET_GRAMMAR}`,
    );
  }
  return { method: "section", arg: target };
}
