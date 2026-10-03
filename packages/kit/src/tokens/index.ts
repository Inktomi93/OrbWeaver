// The ONE generic, model-agnostic token estimator — for UI/field/prompt-size displays.
// We deliberately do NOT ship a per-model tokenizer set: there is no public Claude-3+ tokenizer,
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
 * the imported 890-chat corpus: the engine's own `prompt_tokens` ran up to **1.4156×** this estimate, and 6 of
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
 * The most tokens {@link safeTokenWindow} holds back from one window. The proportional discount sizes the
 * slack below the crossover (`TOKEN_HEADROOM_SLACK_CAP / (1 − TOKENIZER_HEADROOM_FACTOR)`); above it the slack
 * stays at this cap, so a large window keeps nearly all of itself (a 200k window keeps about 96%). Above the
 * crossover the tolerated estimate error falls below the measured ratio, by owner ruling: a large window trades
 * that margin for context.
 */
export const TOKEN_HEADROOM_SLACK_CAP = 8192;

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
 * The largest ESTIMATED-token budget that is safe to measure against a hard model window of `windowTokens`:
 * the window minus a slack of `min(window × (1 − TOKENIZER_HEADROOM_FACTOR), TOKEN_HEADROOM_SLACK_CAP)` (see
 * {@link TOKENIZER_HEADROOM_FACTOR} and {@link TOKEN_HEADROOM_SLACK_CAP}). Every caller that cuts content to fit a real engine window — the
 * embed clamp, the memory segment chunker — sizes against THIS, never the raw window, so the discount has one
 * home and cannot drift between them.
 */
export function safeTokenWindow(windowTokens: number): number {
  // #1359: `Math.max(0, NaN)` is NaN, so an un-guarded non-finite window used to leave HERE as a number
  // that poisons every downstream budget subtraction silently (`safeTokenWindow(x) - RESERVE` stays NaN
  // and every `<=` comparison against it reads false). The window arrives from provider/model config, so
  // a non-finite value is a config-ingestion defect and this is the seam that can still name it. A
  // NEGATIVE window is NOT nonsense — it floors at 0, which is the stated contract.
  if (!Number.isFinite(windowTokens)) {
    throw new RangeError(`safeTokenWindow: windowTokens must be finite, got ${windowTokens}`);
  }
  return Math.max(0, Math.floor(windowTokens * TOKENIZER_HEADROOM_FACTOR), windowTokens - TOKEN_HEADROOM_SLACK_CAP);
}

/** The effective integer budget for a cut. A FRACTIONAL `maxTokens` breaks the "every piece fits" bound
 *  outright — `estimateTokens` is integer-valued and its floor for any non-empty piece is 1, so a 0.5
 *  budget admits no piece at all while the pre-guard loop happily emitted single-character ones (#1359).
 *  Flooring makes the two cutters agree with the estimator they measure against, and `NaN` collapses to
 *  the same "nothing can fit" arm `maxTokens <= 0` already had. */
function effectiveBudget(maxTokens: number): number {
  return Number.isNaN(maxTokens) ? 0 : Math.floor(maxTokens);
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
 * when it already fits, and `""` when the budget admits nothing ({@link effectiveBudget}: `<= 0`, a
 * fraction below 1, or `NaN`).
 *
 * A clamp LOSES content, so it belongs only where the input is transient (a scoring pass, a query, an
 * already-chunked body). Content that FEEDS MEMORY is chunked instead — {@link splitToTokenBudget} — because a
 * vector built from the head of a block claims a span it never read (owner ruling, #165).
 */
export function clampToTokenBudget(text: string, maxTokens: number): string {
  const budget = effectiveBudget(maxTokens);
  if (budget <= 0) {
    return "";
  }
  if (estimateTokens(text) <= budget) {
    return text;
  }
  const codepoints = Array.from(text);
  return codepoints.slice(0, longestFittingPrefix(codepoints, budget)).join("");
}

/**
 * Split `text` into consecutive pieces that each fit `maxTokens`, LOSING NOTHING: concatenating the result
 * reproduces the input exactly. The lossless twin of {@link clampToTokenBudget} — this is what memory-feeding
 * content gets (a 200k-char message becomes N in-budget pieces, each an honest verbatim span).
 *
 * Greedy head-first, cutting on codepoints. Empty input ⇒ `[]`; a budget that admits nothing
 * ({@link effectiveBudget}: `<= 0`, a fraction below 1, or `NaN`) ⇒ `[]` (no piece could ever fit, and the
 * caller must treat an empty result as "this cannot be chunked" rather than as "nothing to do").
 */
export function splitToTokenBudget(text: string, maxTokens: number): string[] {
  const budget = effectiveBudget(maxTokens);
  if (budget <= 0 || text.length === 0) {
    return [];
  }
  if (estimateTokens(text) <= budget) {
    return [text];
  }
  const codepoints = Array.from(text);
  const pieces: string[] = [];
  let cursor = 0;
  while (cursor < codepoints.length) {
    const rest = codepoints.slice(cursor);
    // At least one codepoint always advances: a single codepoint estimates to 1 token, and budget >= 1.
    const take = Math.max(1, longestFittingPrefix(rest, budget));
    pieces.push(rest.slice(0, take).join(""));
    cursor += take;
  }
  return pieces;
}
