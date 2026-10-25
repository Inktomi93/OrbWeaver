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
}

const BLANK = " ";

function blankRange(text: string, from: number, to: number): string {
  return text.slice(0, from) + text.slice(from, to).replace(/[^\n]/gu, BLANK) + text.slice(to);
}

interface Span {
  readonly kind: "comment" | "string";
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

// One left-to-right pass with quote state: a `/*` inside a string opens nothing, a quote inside a comment opens
// nothing. An unterminated comment runs to the end of the input.
function inertSpans(css: string): Span[] {
  const spans: Span[] = [];
  let i = 0;
  while (i < css.length) {
    const isComment = css[i] === "/" && css[i + 1] === "*";
    const isString = css[i] === '"' || css[i] === "'";
    if (isComment || isString) {
      const to = isComment ? commentEnd(css, i) : stringEnd(css, i);
      spans.push({ kind: isComment ? "comment" : "string", from: i, to });
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
  { kind: "slot", declaration: false, pattern: /\[data-slot~?=["']?([\w-]+)/gu, readsStrings: true },
  { kind: "shell-class", declaration: false, pattern: /\.(shell-[\w-]+)/gu },
  { kind: "token", declaration: false, pattern: /var\(\s*(--[\w-]+)/gu },
  { kind: "token", declaration: true, pattern: /(?<![\w-])(--[\w-]+)\s*:/gu },
];

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
    [...(readsStrings === true ? withStrings : code).matchAll(pattern)].flatMap((match) => {
      const name = match[1];
      // A slot match whose `[` was blanked sits inside a string or a prelude.
      if (name === undefined || code[match.index] === BLANK) {
        return [];
      }
      const from = match.index + match[0].indexOf(name);
      const to = from + name.length;
      const fallback = kind === "token" && !declaration && /^\s*,/u.test(code.slice(to));
      return [{ kind, name, from, to, declaration, fallback }];
    }),
  ).sort((a, b) => a.from - b.from);
}
