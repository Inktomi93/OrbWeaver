// A minimal CSS RULE reader for the gates whose unit is a rule rather than a line (`over-art-plate-arm`).
// A line scan cannot answer "which selector owns this declaration", and every glass/plate question in this
// repo is exactly that question. Comment spans are blanked by the ONE blanker (`comment-spans.ts`) before
// parsing — LENGTH-PRESERVING, so `preludeStart`/`braceStart` index the RAW text at the same coordinates,
// which is what lets a caller read a line-adjacent `/* @marker: … */` back out of the raw bytes.
import { blankCssComments } from "./comment-spans.ts";

/** ONE declaration inside a rule block, with the line its finding anchors on.
 *  @public knip type-face false positive — a structural field of the exported `CssRule` shape (its
 *  `declarations` field), never referenced by its own name outside this file. */
export interface CssDeclaration {
  readonly prop: string;
  /** Whitespace-collapsed value, `;` and surrounding trivia stripped. */
  readonly value: string;
  /** Authored value with surrounding trivia stripped and internal spacing preserved. */
  readonly rawValue: string;
  /** 1-based line of the declaration's property name. */
  readonly line: number;
  /** 1-based column of the declaration's property name. */
  readonly column: number;
  /** Zero-based offset of the declaration's property name in the raw stylesheet. */
  readonly offset: number;
  /** Zero-based offset of the first non-whitespace character in the declaration value. */
  readonly valueOffset: number;
}

/** ONE style rule (never an at-rule; at-rule bodies are descended into so nested rules are still yielded). */
export interface CssRule {
  /** The whole selector list, whitespace-collapsed (`a, b`). */
  readonly selectorList: string;
  /** Each selector of the list, trimmed and whitespace-collapsed. */
  readonly selectors: readonly string[];
  /** 1-based line of the first selector. */
  readonly line: number;
  /** Offset of the character AFTER the previous `{`/`}`/`;` — the start of this rule's leading trivia. */
  readonly preludeStart: number;
  /** Offset of the rule's `{`. */
  readonly braceStart: number;
  /** Zero-based offset of the `}` that closes this rule's block — the STYLE-RULE twin of
   *  {@link CssAtRule.end}, and it exists for the same reason: a consumer must be able to ask ANCESTRY
   *  ("which selector encloses this offset") without re-counting braces over the raw text. Publishing only
   *  the at-rule end made half of that question askable and the other half invisible, which silently
   *  dropped a `--color-*` written inside a `@media` nested in a `[data-theme]` block from the seed palette
   *  it belongs to (#2293 leg 2). The parser already knew both ends; only the at-rule half was published. */
  readonly end: number;
  readonly declarations: readonly CssDeclaration[];
}

export interface ParsedCssStylesheet {
  readonly rules: readonly CssRule[];
  readonly atRules: readonly CssAtRule[];
  readonly statements: readonly CssStatementAtRule[];
}

/** ONE STATEMENT at-rule — `@import "x";`, `@source "y";`, `@charset "utf-8";`, `@layer a, b;`.
 *
 *  WHY IT EXISTS AS A SEPARATE FACT. `CssAtRule` is pushed only from `closeFrame`, which fires on `}`, so a
 *  BLOCKLESS at-rule produced no parser fact at all and `CssFacts` structurally could not answer "what does
 *  this sheet import" (measured 2026-09-12, `css-family-audit-2026-09-12.md` §(d): a five-line sheet with
 *  two `@import`s and one `@source` parsed to `statement at-rules seen = 0` while the `@media` control was
 *  seen). Every consumer that wanted the answer owned a private `@import` regex over blanked text, which is
 *  the forbidden-machinery shape §12.3 bans.
 *
 *  THE PRELUDE SPELLING MATCHES {@link CssAtRule.prelude} ON PURPOSE: the WHOLE collapsed at-rule text, the
 *  at-keyword included and the terminating `;` excluded, so one word means one thing across both facts. The
 *  at-keyword is ALSO published as {@link name} (lowercased, no `@`) because that is the join every consumer
 *  makes, and re-deriving it per consumer is how a dispatch goes case-sensitive by accident. */
export interface CssStatementAtRule {
  /** The at-keyword, lowercased and WITHOUT the `@` — `import`, `source`, `charset`, `layer`. CSS at-keywords
   *  are ASCII case-insensitive, so the fact publishes the folded spelling and a consumer compares literals. */
  readonly name: string;
  /** The whole collapsed statement text without its `;` — `@import "./theme.css" layer(base)`. */
  readonly prelude: string;
  /** 1-based line of the `@`. */
  readonly line: number;
  /** Zero-based offset of the `@` in the raw stylesheet. */
  readonly offset: number;
}

export interface CssAtRule {
  readonly prelude: string;
  readonly line: number;
  readonly offset: number;
  /** Zero-based offset of the `}` that closes this at-rule's block. The parser already knows it, and
   *  publishing it is what lets a consumer ask ANCESTRY — "is this declaration inside a `@keyframes` / a
   *  `prefers-reduced-motion` floor" — without re-counting braces. A declaration's own `owner` cannot
   *  answer that: `@media (…) { * { … } }` owns its declarations through the INNER style rule, so a
   *  consumer reading `owner` alone sees `*` and never the prelude (`atRulesContaining` below). */
  readonly end: number;
  /** Declarations authored directly in this block; nested rules/at-rules are separate parser facts. */
  readonly declarations: readonly CssDeclaration[];
}

export interface CssSelectorPart {
  readonly selector: string;
  readonly authored: string;
  /** Zero-based offset of the selector's first non-whitespace character in the supplied prelude. */
  readonly offset: number;
}

const AT = "@";
const COMBINATORS = new Set([">", "+", "~"]);
const OPENERS = new Set(["(", "["]);
const CLOSERS = new Set([")", "]"]);
const QUOTES = new Set(['"', "'"]);
const WS_RUN = /\s+/gu;

function collapse(text: string): string {
  return text.trim().replace(WS_RUN, " ");
}

/** offset → 1-based line, materialized once per stylesheet (a CSS file is tens of KB). */
function lineIndex(text: string): Int32Array {
  const out = new Int32Array(text.length + 1);
  let line = 1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    out[i] = line;
    line += ch === "\n" ? 1 : 0;
  }
  out[text.length] = line;
  return out;
}

interface Scan {
  readonly text: string;
  readonly lines: Int32Array;
}

function columnAt(text: string, offset: number): number {
  return offset - text.lastIndexOf("\n", offset - 1);
}

function pushDeclaration(out: CssDeclaration[], scan: Scan, span: { readonly start: number; readonly end: number }): void {
  const raw = scan.text.slice(span.start, span.end);
  const colon = raw.indexOf(":");
  const prop = colon === -1 ? "" : raw.slice(0, colon).trim();
  if (prop === "" || prop.startsWith(AT) || raw.includes("{")) {
    return;
  }
  const leading = raw.length - raw.trimStart().length;
  const offset = span.start + leading;
  const rawValue = raw.slice(colon + 1);
  const valueOffset = span.start + colon + 1 + (rawValue.length - rawValue.trimStart().length);
  out.push({
    prop,
    value: collapse(rawValue),
    rawValue: rawValue.trim(),
    line: scan.lines[offset] ?? 1,
    column: columnAt(scan.text, offset),
    offset,
    valueOffset,
  });
}

/** Top-level declarations of one block body; nested blocks are skipped (they parse as their own rules). */
function readDeclarations(scan: Scan, bodyStart: number, bodyEnd: number): CssDeclaration[] {
  const out: CssDeclaration[] = [];
  let depth = 0;
  let start = bodyStart;
  for (let i = bodyStart; i < bodyEnd; i += 1) {
    const ch = scan.text[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      start = i + 1;
    } else if (ch === ";" && depth === 0) {
      pushDeclaration(out, scan, { start, end: i });
      start = i + 1;
    }
  }
  pushDeclaration(out, scan, { start, end: bodyEnd });
  return out;
}

interface Frame {
  readonly prelude: string;
  readonly preludeStart: number;
  readonly braceStart: number;
}

function closeFrame(scan: Scan, frame: Frame | undefined, closeAt: number, stylesheet: { rules: CssRule[]; atRules: CssAtRule[] }): void {
  if (frame === undefined) {
    return;
  }
  const rule = toRule(scan, frame, closeAt);
  if (rule !== undefined) {
    stylesheet.rules.push(rule);
  } else if (frame.prelude.trimStart().startsWith(AT)) {
    const leading = frame.prelude.length - frame.prelude.trimStart().length;
    const offset = frame.preludeStart + leading;
    stylesheet.atRules.push({
      prelude: collapse(frame.prelude),
      line: scan.lines[offset] ?? 1,
      offset,
      end: closeAt,
      declarations: readDeclarations(scan, frame.braceStart + 1, closeAt),
    });
  }
}

function toRule(scan: Scan, frame: Frame, closeAt: number): CssRule | undefined {
  const prelude = frame.prelude.trim();
  if (prelude === "" || prelude.startsWith(AT)) {
    return;
  }
  const leading = frame.prelude.length - frame.prelude.trimStart().length;
  return {
    selectorList: collapse(prelude),
    selectors: splitSelectorList(prelude),
    line: scan.lines[frame.preludeStart + leading] ?? 1,
    preludeStart: frame.preludeStart,
    braceStart: frame.braceStart,
    end: closeAt,
    declarations: readDeclarations(scan, frame.braceStart + 1, closeAt),
  };
}

/** Every STYLE rule of one stylesheet, in source order, at-rules descended into. Comments are blanked
 *  first, so a commented-out rule is never parsed and offsets still index the raw text. */
export function parseCssStylesheet(rawText: string): ParsedCssStylesheet {
  const text = blankCssComments(rawText);
  const scan: Scan = { text, lines: lineIndex(text) };
  const rules: CssRule[] = [];
  const atRules: CssAtRule[] = [];
  const statements: CssStatementAtRule[] = [];
  const stack: Frame[] = [];
  let preludeStart = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") {
      stack.push({ prelude: text.slice(preludeStart, i), preludeStart, braceStart: i });
      preludeStart = i + 1;
    } else if (ch === "}") {
      closeFrame(scan, stack.pop(), i, { rules, atRules });
      preludeStart = i + 1;
    } else if (ch === ";") {
      pushStatement(statements, scan, preludeStart, i);
      preludeStart = i + 1;
    }
  }
  return {
    rules: rules.toSorted((left, right) => left.braceStart - right.braceStart),
    atRules: atRules.toSorted((left, right) => left.offset - right.offset),
    statements,
  };
}

const AT_KEYWORD = /^@(?<name>[a-zA-Z-][a-zA-Z0-9-]*)/u;

/** A `;`-terminated span whose first non-whitespace character is `@`. Comments were blanked before the scan,
 *  so an `@import` inside a comment reaches here as spaces and is refused by the same test that refuses a
 *  declaration — no separate comment fence, and no way for the two to disagree. A span that begins with `@`
 *  but carries no legal at-keyword (`@ import`, `@"x"`) is refused rather than published under an empty
 *  name: an at-rule the parser cannot name is not a fact about the sheet. */
function pushStatement(out: CssStatementAtRule[], scan: Scan, start: number, end: number): void {
  const raw = scan.text.slice(start, end);
  const leading = raw.length - raw.trimStart().length;
  const trimmed = raw.trim();
  const keyword = AT_KEYWORD.exec(trimmed)?.groups?.["name"];
  if (keyword === undefined) {
    return;
  }
  const offset = start + leading;
  out.push({ name: keyword.toLowerCase(), prelude: collapse(trimmed), line: scan.lines[offset] ?? 1, offset });
}

/** The first quoted argument of a statement at-rule — the specifier of `@import "x"`, the root of
 *  `@source "y"`, the encoding of `@charset "z"` — or undefined when the statement carries none
 *  (`@layer a, b`, `@import url(x)`).
 *
 *  IT LIVES HERE, NOT IN A CONSUMER. Reading a quoted token out of an at-rule prelude is CSS grammar, and a
 *  consumer that spells its own `/@import\s+["']…/` has re-minted the private reader this fact exists to
 *  delete. Quotes are unescaped inside the run because a CSS string escape cannot appear in any specifier
 *  this repo authors, and the parser's own scanner does not distinguish an escaped quote from the end of the
 *  run either (`ops/resource-tree.ts#quoteProblem` REFUSES such a sheet before it is ever parsed). */
export function quotedStatementArgument(statement: CssStatementAtRule): string | undefined {
  const groups = /'(?<single>[^']*)'|"(?<double>[^"]*)"/u.exec(statement.prelude)?.groups;
  return groups?.["single"] ?? groups?.["double"];
}

/** The at-rule ANCESTORS of one offset, outermost first — the ancestry a declaration's own `owner` cannot
 *  express. A declaration written `@media (…) { .a { … } }` is owned by `.a`, so a policy asking "is this
 *  inside a `@keyframes`" or "is this under the reduced-motion floor" must walk containment instead, and
 *  every such policy re-counting braces off the raw text is the private-walk shape the contract bans.
 *  Containment is offset-based and therefore exact: the parser recorded both ends of every block. */
export function atRulesContaining(atRules: readonly CssAtRule[], offset: number): readonly CssAtRule[] {
  return atRules.filter((atRule) => atRule.offset <= offset && offset <= atRule.end);
}

/** The STYLE-RULE ancestors of one offset, outermost first — the twin of {@link atRulesContaining}, and it
 *  completes the ancestry question rather than answering half of it. A declaration written
 *  `[data-theme="dusk"] { @media (…) { --color-x: … } }` is OWNED by the `@media` at-rule, so a consumer
 *  reading `owner` (or only the at-rule ancestry) never learns which SELECTOR the declaration sits under —
 *  which is how the seed-palette reader lost a conditional token in #2293 leg 2. Containment is
 *  offset-based and therefore exact: the parser records both ends of every block. A rule always contains
 *  ITSELF, so the innermost entry of `[...rulesContaining, ...atRulesContaining]` sorted by start is the
 *  declaration's own owner and everything before it is a true ancestor. */
export function rulesContaining(rules: readonly CssRule[], offset: number): readonly CssRule[] {
  return rules.filter((rule) => rule.braceStart <= offset && offset <= rule.end);
}

/** Split at top-level commas only — `:not(a, b)` and `[attr="x,y"]` keep their commas. */
export function splitSelectorList(prelude: string): readonly string[] {
  return splitSelectorListWithOffsets(prelude).map((part) => part.selector);
}

/** Split a selector list while retaining each arm's exact start in the authored prelude. */
export function splitSelectorListWithOffsets(prelude: string): readonly CssSelectorPart[] {
  return splitTopLevelSpans(prelude, ",").flatMap(({ text, start }) => {
    const leading = text.length - text.trimStart().length;
    const selector = collapse(text);
    return selector === "" ? [] : [{ selector, authored: text.trim(), offset: start + leading }];
  });
}

/** Split `text` at `sep`, ignoring separators nested inside `()`/`[]` or a quoted run. */
function splitTopLevel(text: string, sep: string): readonly string[] {
  return splitTopLevelSpans(text, sep).map((span) => span.text);
}

function splitTopLevelSpans(text: string, sep: string): readonly { readonly text: string; readonly start: number }[] {
  const out: string[] = [];
  let start = 0;
  walkTopLevel(text, (ch, i) => {
    if (ch === sep) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  });
  out.push(text.slice(start));
  let offset = 0;
  return out.map((part) => {
    const span = { text: part, start: offset };
    offset += part.length + 1;
    return span;
  });
}

/** Visit every character that sits at bracket depth 0 and outside a quoted run. */
function walkTopLevel(text: string, at: (ch: string, index: number) => void): void {
  let depth = 0;
  let quote = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    if (quote !== "") {
      quote = ch === quote ? "" : quote;
    } else if (QUOTES.has(ch)) {
      quote = ch;
    } else if (OPENERS.has(ch)) {
      depth += 1;
    } else if (CLOSERS.has(ch)) {
      depth -= 1;
    } else if (depth === 0) {
      at(ch, i);
    }
  }
}

/** The arguments of `fn(...)` when `value` IS that call, else null. Depth-aware, so a nested
 *  `color-mix(…, …)` inside `light-dark(…)` stays ONE argument. */
export function callArguments(value: string, fn: string): readonly string[] | null {
  const head = `${fn}(`;
  if (value.startsWith(head) && value.endsWith(")")) {
    return splitTopLevel(value.slice(head.length, -1), ",").map((a) => a.trim());
  }
  return null;
}

/** The SUBJECT of a complex selector — its LAST compound, i.e. what the rule actually styles. Descendant,
 *  `>`, `+` and `~` combinators are recognised at bracket depth 0 only, so `:not([data-section="chats"])`
 *  and `[attr="a b"]` stay attached to their compound. */
export function selectorSubject(selector: string): string {
  const text = collapse(selector);
  let subjectStart = 0;
  walkTopLevel(text, (ch, i) => {
    if (ch === " " || COMBINATORS.has(ch)) {
      subjectStart = i + 1;
    }
  });
  return text.slice(subjectStart);
}
