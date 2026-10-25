// Finds the theme-hook names a stylesheet spells, with the exact span of each name. The rewrite and the stale-hook
// warnings both read this, so they agree on what counts as a reference.
import type { OwnerCssHookKind } from "./hook.ts";

export interface HookReference {
  readonly kind: OwnerCssHookKind;
  readonly name: string;
  readonly from: number;
  readonly to: number;
  /** A custom property being declared (`--x: …`), as opposed to read through `var(--x)`. */
  readonly declaration: boolean;
  /** A `var(--x, fallback)`: the author supplied a value for when the property is unset, so it is theirs to own. */
  readonly fallback: boolean;
  /** An attribute selector's operator and value, when the reference is one. */
  readonly attribute?: AttributeMatch;
}

export interface AttributeMatch {
  /** `=`, `~=` and the partial operators; `null` for the presence-only form `[name]`. */
  readonly operator: string | null;
  /** The value with its CSS escapes decoded. */
  readonly text: string | null;
  /** The span of the value text as written, quotes excluded. */
  readonly from: number;
  readonly to: number;
  /** The `i` flag: the value compares without regard to case. */
  readonly caseInsensitive: boolean;
}

const BLANK = " ";
// Enough characters after `url(` to see whether a quote or the url body follows the whitespace.
const URL_LOOKAHEAD = 64;

function blankRange(text: string, from: number, to: number): string {
  return text.slice(0, from) + text.slice(from, to).replace(/[^\n]/gu, BLANK) + text.slice(to);
}

interface Span {
  readonly kind: "comment" | "string" | "url";
  readonly from: number;
  readonly to: number;
}

// Where the string opened at `open` ends: past its closing quote, or at the newline that ends an unterminated one.
function stringEnd(css: string, open: number): number {
  const quote = css[open];
  let end = open + 1;
  while (end < css.length && css[end] !== quote && css[end] !== "\n") {
    end += css[end] === "\\" ? 2 : 1;
  }
  return css[end] === quote ? end + 1 : Math.min(end, css.length);
}

function commentEnd(css: string, open: number): number {
  const close = css.indexOf("*/", open + 2);
  return close === -1 ? css.length : close + 2;
}

const UNQUOTED_URL_OPEN = /^url\(\s*(?!["'\s])/iu;

// An unquoted `url(` body is one url token: `/*` and quotes inside it are ordinary characters. It ends at the first
// unescaped `)`, or at the end of the input.
function urlEnd(css: string, open: number): number {
  let end = open + "url(".length;
  while (end < css.length && css[end] !== ")") {
    end += css[end] === "\\" ? 2 : 1;
  }
  return Math.min(end + 1, css.length);
}

function isUnquotedUrl(css: string, at: number): boolean {
  return !/[\w-]/u.test(css[at - 1] ?? "") && UNQUOTED_URL_OPEN.test(css.slice(at, at + URL_LOOKAHEAD));
}

function spanKind(css: string, at: number): Span["kind"] | null {
  if (css[at] === "/" && css[at + 1] === "*") {
    return "comment";
  }
  if (css[at] === '"' || css[at] === "'") {
    return "string";
  }
  return isUnquotedUrl(css, at) ? "url" : null;
}

const SPAN_END = { comment: commentEnd, string: stringEnd, url: urlEnd } as const;

// One left-to-right pass with quote state: a `/*` inside a string or url opens nothing, a quote inside a comment
// opens nothing. An unterminated comment runs to the end of the input.
function inertSpans(css: string): Span[] {
  const spans: Span[] = [];
  let i = 0;
  while (i < css.length) {
    const kind = spanKind(css, i);
    if (kind !== null) {
      const to = SPAN_END[kind](css, i);
      spans.push({ kind, from: i, to });
      i = to;
    } else {
      i += 1;
    }
  }
  return spans;
}

/** The text with comments (and, with `strings`, quoted strings) blanked, keeping every offset and newline. */
function blankInert(css: string, strings: boolean): string {
  let out = css;
  for (const span of inertSpans(css)) {
    if (strings || span.kind === "comment") {
      out = blankRange(out, span.from, span.to);
    }
  }
  return out;
}

// A feature query asks whether the browser supports something; the names in it are not styled.
const SUPPORTS_PRELUDE = /@supports\b[^{]*/giu;

interface Pattern {
  readonly kind: OwnerCssHookKind;
  readonly declaration: boolean;
  /** Group 1 is the name. */
  readonly pattern: RegExp;
  /** Reads the slot's quoted value, so it runs with strings intact. */
  readonly readsStrings?: true;
}

// Only the exact-match attribute forms name a whole slot; `^=`, `*=` and `|=` match a prefix or fragment, which no
// surface entry can stand for.
const PATTERNS: readonly Pattern[] = [
  { kind: "slot", declaration: false, pattern: /\[data-slot~?=["']?([\w-]+)/giu, readsStrings: true },
  { kind: "shell-class", declaration: false, pattern: /\.(shell-[\w-]+)/gu },
  // Every `data-*` attribute selector; the readers keep the ones the surface or the rename table speak for.
  // HTML matches attribute names case-insensitively; the value, if any, is read with its quotes.
  {
    kind: "appearance-attribute",
    declaration: false,
    pattern:
      /\[\s*(data-[\w-]+)(?:\s*(?<op>[~|^$*]?=)\s*(?:"(?<dq>(?:[^"\\]|\\.)*)"|'(?<sq>(?:[^'\\]|\\.)*)'|(?<id>(?:[\w-]|\\[0-9a-f]{1,6}\s?|\\[^0-9a-f\n])+))(?:\s*(?<flag>[is])(?![\w-]))?)?/dgiu,
    readsStrings: true,
  },
  { kind: "token", declaration: false, pattern: /var\(\s*(--[\w-]+)/gu },
  { kind: "token", declaration: true, pattern: /(?<![\w-])(--[\w-]+)\s*:/gu },
];

const VALUE_GROUPS = ["dq", "sq", "id"] as const;
const CSS_ESCAPE = /\\(?:([0-9a-f]{1,6})\s?|([^0-9a-f\n]))/giu;
const MAX_CODE_POINT = 0x10_ff_ff;
const HEX = 16;
const REPLACEMENT = "\uFFFD";

function unescapeCss(text: string): string {
  return text.replace(CSS_ESCAPE, (_escape, hex: string | undefined, literal: string | undefined) => {
    if (hex === undefined) {
      return literal ?? "";
    }
    const code = Number.parseInt(hex, HEX);
    return code === 0 || code > MAX_CODE_POINT ? REPLACEMENT : String.fromCodePoint(code);
  });
}

function attributeMatch(match: RegExpExecArray): AttributeMatch {
  const group = VALUE_GROUPS.find((candidate) => match.groups?.[candidate] !== undefined);
  const span = group === undefined ? undefined : match.indices?.groups?.[group];
  return {
    operator: match.groups?.["op"] ?? null,
    text: group === undefined ? null : unescapeCss(match.groups?.[group] ?? ""),
    from: span?.[0] ?? 0,
    to: span?.[1] ?? 0,
    caseInsensitive: match.groups?.["flag"]?.toLowerCase() === "i",
  };
}

/** Every hook reference in live code (not in a comment, a string or an `@supports` condition), in document order. */
export function scanHooks(css: string): readonly HookReference[] {
  let code = blankInert(css, true);
  let withStrings = blankInert(css, false);
  for (const prelude of code.matchAll(SUPPORTS_PRELUDE)) {
    const to = prelude.index + prelude[0].length;
    code = blankRange(code, prelude.index, to);
    withStrings = blankRange(withStrings, prelude.index, to);
  }
  return PATTERNS.flatMap(({ kind, declaration, pattern, readsStrings }) =>
    [...(readsStrings === true ? withStrings : code).matchAll(pattern)].flatMap((match): HookReference[] => {
      const name = match[1];
      // A slot match whose `[` was blanked sits inside a string or a prelude.
      if (name === undefined || code[match.index] === BLANK) {
        return [];
      }
      const from = match.index + match[0].indexOf(name);
      const to = from + name.length;
      const fallback = kind === "token" && !declaration && /^\s*,/u.test(code.slice(to));
      if (kind !== "appearance-attribute") {
        return [{ kind, name, from, to, declaration, fallback }];
      }
      return [{ kind, name: name.toLowerCase(), from, to, declaration, fallback, attribute: attributeMatch(match) }];
    }),
  ).sort((a, b) => a.from - b.from);
}
