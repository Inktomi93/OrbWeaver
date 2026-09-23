// config-search-tokens — the PURE grammar of the Settings search's typed `@` filters
// (VS Code's settings-search token grammar): `@modified` · `@shelf:<shelf>` · `@in:<groupId>` ·
// `@ext:<plugin-slug>` · `@advanced`. Tier 4 (`#lib`) on §13.9's homing rule: pure, DOM-free, one consumer
// today (the config feature); it graduates to `@orb/kit` only when a second consumer appears. It deliberately
// knows NO vocabulary — `shelf`/`group` are raw strings the FEATURE validates against its tuples (the lib
// floor cannot import `#state`), and an unknown shelf simply matches nothing, which is the honest answer.
//
// The highlight helper lives here with the parser because the two are one contract: the ranges are computed
// over the SAME whitespace terms the parser strips the tokens out of, so a token can never be "found" inside
// a row label.

/** One `@` token the funnel menu offers, with the hint the menu renders beside it. */
export interface ConfigQueryToken {
  /** The insertable text — value-taking tokens end with `:` so the caret lands ready for the value. */
  readonly token: string;
  readonly hint: string;
}

/** The whole token vocabulary, in menu order — the funnel and the `@` menu render exactly this list. */
export const CONFIG_QUERY_TOKENS: readonly ConfigQueryToken[] = [
  { token: "@modified", hint: "only settings that differ from their default" },
  { token: "@shelf:", hint: "one shelf — user, app, collections or extensions" },
  { token: "@in:", hint: "one group, by its id (appearance, chat-behavior, …)" },
  { token: "@ext:", hint: "one plugin's rows, by its slug" },
  { token: "@advanced", hint: "include the advanced rows hidden by default" },
];

export interface ParsedConfigQuery {
  /** The free-text remainder — every non-`@` word, joined by single spaces. */
  readonly terms: string;
  readonly modified: boolean;
  readonly advanced: boolean;
  /** `@shelf:<value>`, lowercased. Absent when the token wasn't typed; empty-valued spellings are UNKNOWN. */
  readonly shelf?: string;
  /** `@in:<groupId>`, as typed (group ids are mixed-case — `worldInfo`); the consumer compares its own way. */
  readonly group?: string;
  /** `@ext:<slug>`, lowercased. */
  readonly ext?: string;
  /** `@` words that parse as tokens but aren't in the grammar (a typo, an empty value) — surfaced, never
   *  silently dropped as search text: `@shefl:app` matching a row about shelves would be a lie. */
  readonly unknown: readonly string[];
}

const VALUE_TOKEN_RE = /^@(shelf|in|ext):(.*)$/iu;

interface MutableParse {
  terms: string[];
  unknown: string[];
  modified: boolean;
  advanced: boolean;
  shelf?: string;
  group?: string;
  ext?: string;
}

/** One `@` word into the accumulator: a bare flag, a valued token, or unknown. */
function applyTokenWord(word: string, out: MutableParse): void {
  const lower = word.toLowerCase();
  if (lower === "@modified") {
    out.modified = true;
    return;
  }
  if (lower === "@advanced") {
    out.advanced = true;
    return;
  }
  const valued = VALUE_TOKEN_RE.exec(word);
  const value = valued?.[2];
  if (valued === null || value === undefined || value.length === 0) {
    out.unknown.push(word);
    return;
  }
  const kind = (valued[1] ?? "").toLowerCase();
  if (kind === "shelf") {
    out.shelf = value.toLowerCase();
  } else if (kind === "in") {
    out.group = value;
  } else {
    out.ext = value.toLowerCase();
  }
}

/** Parse a live query into free-text terms + the typed filters. Whitespace-tokenised; later duplicate
 *  value-tokens win (the one nearest the caret is the one being edited). */
export function parseConfigQuery(text: string): ParsedConfigQuery {
  const out: MutableParse = { terms: [], unknown: [], modified: false, advanced: false };
  for (const word of text.split(/\s+/u)) {
    if (word.length === 0) {
      continue;
    }
    if (word.startsWith("@")) {
      applyTokenWord(word, out);
    } else {
      out.terms.push(word);
    }
  }
  return {
    terms: out.terms.join(" "),
    modified: out.modified,
    advanced: out.advanced,
    ...(out.shelf === undefined ? {} : { shelf: out.shelf }),
    ...(out.group === undefined ? {} : { group: out.group }),
    ...(out.ext === undefined ? {} : { ext: out.ext }),
    unknown: out.unknown,
  };
}

/** The trailing, still-being-typed `@` token (the caret is inside it — no whitespace after), or null. The
 *  input shows the TOKEN MENU while this is non-null, filtered to tokens it prefixes. */
export function partialConfigToken(text: string): string | null {
  if (text.length === 0 || /\s$/u.test(text)) {
    return null;
  }
  const last = text.split(/\s+/u).at(-1) ?? "";
  return last.startsWith("@") ? last : null;
}

/** Replace the trailing partial `@` token with a chosen one (the token-menu select). A value-taking token
 *  leaves the caret after its `:`; a completed bare token appends a space so typing continues as terms. The
 *  funnel's lone `@` is itself a PARTIAL — no space, or the menu it exists to open would never show. */
export function applyConfigToken(text: string, token: string): string {
  const partial = partialConfigToken(text);
  const base = partial === null ? text : text.slice(0, text.length - partial.length);
  const caret = token.endsWith(":") || token === "@" ? "" : " ";
  return `${base}${token}${caret}`;
}

/** Char-offset `[start, end)` ranges of every case-insensitive occurrence of every term in `label` — the
 *  `HighlightedText` marks. Literal substrings only: a fuzzy hit with no literal overlap renders unmarked
 *  rather than marking the wrong letters. */
export function findHighlightRanges(label: string, terms: string): readonly { readonly start: number; readonly end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  const haystack = label.toLowerCase();
  for (const term of terms.toLowerCase().split(/\s+/u)) {
    if (term.length === 0) {
      continue;
    }
    let from = 0;
    while (from <= haystack.length - term.length) {
      const at = haystack.indexOf(term, from);
      if (at === -1) {
        break;
      }
      ranges.push({ start: at, end: at + term.length });
      from = at + term.length;
    }
  }
  return ranges;
}
