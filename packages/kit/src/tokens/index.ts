// The ONE generic, model-agnostic token estimator — for UI/field/prompt-size displays.
// We deliberately do NOT ship a per-model tokenizer zoo: there is no public Claude-3+ tokenizer,
// counts vary per model anyway, and OpenRouter's own guidance is "don't pre-estimate — read the
// response `usage`". So this is an advisory estimate, not billing truth. Truth = the provider
// `usage` we capture post-turn.
//
// Algorithm = OpenRouter's "QuadChars": every 4 printable-ASCII chars ≈ 1 token, and each other
// codepoint (control char, accented letter, CJK, emoji) ≈ 1 token. That makes our number track
// OpenRouter's *normalized* (cross-model) count — a nice consistency property — while staying a
// pure, zero-dependency, O(n) function that runs anywhere (server today, client later) with no
// vocab file and no native binary. It is NOT biased high: for a number shown next to a field, an
// honest estimate beats a conservative one (the budget-bar "round up" instinct belongs elsewhere).

const PRINTABLE_ASCII_LOW = 0x20; // space
const PRINTABLE_ASCII_HIGH = 0x7e; // tilde
const CHARS_PER_TOKEN = 4;

/**
 * The fraction of a HARD model window this estimate may be measured against (#187).
 *
 * QuadChars is an ADVISORY estimate, not a tokenizer, and it undercounts real BPE vocabularies on dense
 * prose/code. Measured live against the box's embed engine (Qwen3-VL-Embedding-2B, `max_model_len` 8192) over
 * the imported 895-chat corpus: the engine's own `prompt_tokens` ran up to **1.4156×** this estimate, and 6 of
 * the 30 largest transcript blocks — cut to exactly `window - 64` estimated tokens — were refused HTTP 400
 * ("at least 8193 input tokens"). A FLAT reserve cannot absorb a PROPORTIONAL error, which is why the old
 * 64-token scaffold reserve did not save them.
 *
 * 0.7 ≈ 1 / 1.4156 (rounded down), so the worst ratio measured still lands inside the window. The cost is
 * packing density (an over-window block cuts into slightly more pieces); the cost of being wrong the other way
 * is a 400 that fails a whole embed batch. Nothing is truncated either way — over-budget content is CHUNKED.
 */
export const TOKENIZER_HEADROOM_FACTOR = 0.7;

/**
 * Generic token estimate for one string. Model-agnostic (see file header). Returns 0 for empty.
 *
 * `for…of` iterates Unicode codepoints (surrogate pairs handled), so a non-ASCII codepoint — an
 * accented letter, a CJK character, or each codepoint of a multi-codepoint emoji — counts as 1.
 */
export function estimateTokens(text: string): number {
  let printableAscii = 0;
  let other = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= PRINTABLE_ASCII_LOW && cp <= PRINTABLE_ASCII_HIGH) {
      printableAscii += 1;
    } else {
      other += 1;
    }
  }
  return Math.ceil(printableAscii / CHARS_PER_TOKEN) + other;
}

/**
 * The largest ESTIMATED-token budget that is safe to measure against a hard model window of `windowTokens`
 * (see {@link TOKENIZER_HEADROOM_FACTOR}). Every caller that cuts content to fit a real engine window — the
 * embed clamp, the memory segment chunker — sizes against THIS, never the raw window, so the discount has one
 * home and cannot drift between them.
 */
export function safeTokenWindow(windowTokens: number): number {
  return Math.max(0, Math.floor(windowTokens * TOKENIZER_HEADROOM_FACTOR));
}

/** The longest CODEPOINT prefix of `text` that fits `maxTokens` — the shared search {@link clampToTokenBudget}
 *  and {@link splitToTokenBudget} both cut on. `estimateTokens` is monotonic in prefix length, so a binary
 *  search is exact. Cutting on codepoints (never UTF-16 units) means an astral character — an emoji, some CJK
 *  — can never be split into a lone surrogate the model's tokenizer then chokes on. */
function longestFittingPrefix(codepoints: readonly string[], maxTokens: number): number {
  let fits = 0;
  let over = codepoints.length;
  while (fits < over) {
    const mid = Math.ceil((fits + over) / 2);
    if (estimateTokens(codepoints.slice(0, mid).join("")) <= maxTokens) {
      fits = mid;
    } else {
      over = mid - 1;
    }
  }
  return fits;
}

/**
 * Clamp `text` to at most `maxTokens` — the HEAD survives, the tail is dropped. Returns the input unchanged
 * when it already fits, and `""` when `maxTokens <= 0`.
 *
 * A clamp LOSES content, so it belongs only where the input is transient (a scoring pass, a query, an
 * already-chunked body). Content that FEEDS MEMORY is chunked instead — {@link splitToTokenBudget} — because a
 * vector built from the head of a block claims a span it never read (owner ruling, #165).
 */
export function clampToTokenBudget(text: string, maxTokens: number): string {
  if (maxTokens <= 0) {
    return "";
  }
  if (estimateTokens(text) <= maxTokens) {
    return text;
  }
  const codepoints = Array.from(text);
  return codepoints.slice(0, longestFittingPrefix(codepoints, maxTokens)).join("");
}

/**
 * Split `text` into consecutive pieces that each fit `maxTokens`, LOSING NOTHING: concatenating the result
 * reproduces the input exactly. The lossless twin of {@link clampToTokenBudget} — this is what memory-feeding
 * content gets (a 200k-char message becomes N in-budget pieces, each an honest verbatim span).
 *
 * Greedy head-first, cutting on codepoints. Empty input ⇒ `[]`; `maxTokens <= 0` ⇒ `[]` (no piece could ever
 * fit, and the caller must treat an empty result as "this cannot be chunked" rather than as "nothing to do").
 */
export function splitToTokenBudget(text: string, maxTokens: number): string[] {
  if (maxTokens <= 0 || text.length === 0) {
    return [];
  }
  if (estimateTokens(text) <= maxTokens) {
    return [text];
  }
  const codepoints = Array.from(text);
  const pieces: string[] = [];
  let cursor = 0;
  while (cursor < codepoints.length) {
    const rest = codepoints.slice(cursor);
    // At least one codepoint always advances: a single codepoint estimates to 1 token, and maxTokens >= 1.
    const take = Math.max(1, longestFittingPrefix(rest, maxTokens));
    pieces.push(rest.slice(0, take).join(""));
    cursor += take;
  }
  return pieces;
}
