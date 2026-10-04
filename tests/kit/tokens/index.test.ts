import { clampToTokenBudget, estimateTokens, safeTokenWindow, splitToTokenBudget, TOKEN_HEADROOM_SLACK_CAP, TOKENIZER_HEADROOM_FACTOR } from "@orb/kit/tokens";
import { expect, test } from "../../support/fixtures.ts";

test("empty string is zero tokens", () => {
  expect(estimateTokens("")).toBe(0);
});

test("printable ASCII counts as ~4 chars per token (ceil)", () => {
  expect(estimateTokens("abcd")).toBe(1); // ceil(4/4)
  expect(estimateTokens("abcdefgh")).toBe(2); // ceil(8/4)
  expect(estimateTokens("abc")).toBe(1); // ceil(3/4)
  expect(estimateTokens("abcde")).toBe(2); // ceil(5/4)
});

test("space and tilde are inside the printable-ASCII band", () => {
  expect(estimateTokens("    ")).toBe(1); // 4 spaces → ceil(4/4)
  expect(estimateTokens("~~~~")).toBe(1);
});

test("each non-ASCII codepoint counts as one token", () => {
  expect(estimateTokens("é")).toBe(1); // accented letter
  expect(estimateTokens("你好")).toBe(2); // two CJK codepoints
  expect(estimateTokens("😀")).toBe(1); // one astral-plane codepoint (surrogate pair handled)
});

test("control characters fall outside the printable band (count as 1 each)", () => {
  // "a\nb": a,b printable (ceil(2/4)=1) + newline (1) = 2
  expect(estimateTokens("a\nb")).toBe(2);
});

test("mixed ASCII + non-ASCII sums the two buckets", () => {
  // "abcd😀": 4 printable → 1, plus 1 emoji codepoint → 2
  expect(estimateTokens("abcd😀")).toBe(2);
});

// ── clampToTokenBudget — the LOSSY cut (transient inputs only: a rerank pass, a query) ──────────────

test("clamp leaves an already-fitting string byte-identical", () => {
  expect(clampToTokenBudget("abcd", 4)).toBe("abcd");
});

test("clamp keeps the HEAD and lands inside the budget", () => {
  const clamped = clampToTokenBudget("abcdefghijklmnop", 2); // 16 printable = 4 tokens, budget 2
  expect(estimateTokens(clamped)).toBeLessThanOrEqual(2);
  expect("abcdefghijklmnop".startsWith(clamped)).toBe(true);
});

test("clamp never splits an astral codepoint into a lone surrogate", () => {
  const clamped = clampToTokenBudget("😀😀😀😀", 2);
  expect([...clamped]).toHaveLength(2);
  expect(clamped).toBe("😀😀");
});

test("a non-positive budget clamps to empty (nothing could fit)", () => {
  expect(clampToTokenBudget("abcd", 0)).toBe("");
});

// ── splitToTokenBudget — the LOSSLESS twin (what memory-feeding content gets, #165/#172) ────────────

test("split of a fitting string is the string itself, in one piece", () => {
  expect(splitToTokenBudget("abcd", 4)).toEqual(["abcd"]);
});

test("split LOSES NOTHING — the pieces concatenate back to the input, each inside the budget", () => {
  const text = "the quick brown fox jumps over the lazy dog. ".repeat(20);
  const pieces = splitToTokenBudget(text, 8);
  expect(pieces.join("")).toBe(text);
  for (const p of pieces) {
    expect(estimateTokens(p)).toBeLessThanOrEqual(8);
  }
  expect(pieces.length).toBeGreaterThan(1);
});

test("split is codepoint-safe across astral characters", () => {
  const pieces = splitToTokenBudget("😀😀😀😀😀", 2);
  expect(pieces.join("")).toBe("😀😀😀😀😀");
  expect(pieces).toEqual(["😀😀", "😀😀", "😀"]);
});

test("an empty input or a non-positive budget yields NO pieces (the caller's 'cannot chunk' signal)", () => {
  expect(splitToTokenBudget("", 10)).toEqual([]);
  expect(splitToTokenBudget("abcd", 0)).toEqual([]);
});

// ── safeTokenWindow — the headroom against a REAL tokenizer (#187) ──────────────────────────────────
// The QuadChars estimate is not a tokenizer: measured live against the box's embed engine
// (Qwen3-VL-Embedding-2B, max_model_len 8192) over the imported corpus, the engine's own count ran up to
// 1.4156× this estimate on real transcript text, and 6 of the 30 largest blocks — cut to the estimator's own
// `window - 64` budget — were refused HTTP 400 "at least 8193 input tokens". A flat reserve cannot absorb a
// PROPORTIONAL error, so a hard model window is discounted by a factor before anything is measured against it.

test("safeTokenWindow discounts a hard model window by the measured headroom factor", () => {
  expect(safeTokenWindow(8192)).toBeLessThan(8192);
  // The worst measured estimate→engine ratio was 1.4156; the discounted window must survive it.
  expect(safeTokenWindow(8192) * 1.4156).toBeLessThanOrEqual(8192);
});

// The slack is proportional on a small window and capped on a large one, so a 200k window keeps ~96%.
test("safeTokenWindow caps the slack on a large window at TOKEN_HEADROOM_SLACK_CAP", () => {
  expect(TOKEN_HEADROOM_SLACK_CAP).toBe(8192);
  expect(safeTokenWindow(200_000)).toBe(200_000 - TOKEN_HEADROOM_SLACK_CAP);
  expect(safeTokenWindow(4096)).toBe(Math.floor(4096 * TOKENIZER_HEADROOM_FACTOR));
});

test("the crossover is exact: the last proportional window and the first capped one", () => {
  // 27306 × 0.3 rounds to the cap exactly; one token more and the proportional slack would pass it.
  expect(safeTokenWindow(27_306)).toBe(Math.floor(27_306 * TOKENIZER_HEADROOM_FACTOR));
  expect(safeTokenWindow(27_306)).toBe(27_306 - TOKEN_HEADROOM_SLACK_CAP);
  expect(Math.floor(27_307 * TOKENIZER_HEADROOM_FACTOR)).toBe(27_307 - TOKEN_HEADROOM_SLACK_CAP - 1);
  expect(safeTokenWindow(27_307)).toBe(27_307 - TOKEN_HEADROOM_SLACK_CAP);
});

test("safeTokenWindow is monotonic and never negative", () => {
  expect(safeTokenWindow(2000)).toBeGreaterThan(safeTokenWindow(1000));
  expect(safeTokenWindow(0)).toBe(0);
});

// ── budget boundaries (#1359) ───────────────────────────────────────────────────────────────────────

test("safeTokenWindow REFUSES a non-finite window rather than returning NaN", () => {
  // Pre-guard `Math.max(0, NaN)` is NaN, and the NaN then flowed into every downstream budget
  // subtraction as a silently-poisoned number. The window comes from provider/model config, so a
  // non-finite value is a config-ingestion bug and belongs loud at this seam.
  expect(() => safeTokenWindow(Number.NaN)).toThrow(RangeError);
  expect(() => safeTokenWindow(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  // A negative window still floors at 0 — that arm is a stated part of the contract, not nonsense.
  expect(safeTokenWindow(-5)).toBe(0);
});

test("a FRACTIONAL budget yields no pieces rather than violating the every-piece-fits bound", () => {
  // `splitToTokenBudget("hello world", 0.5)` used to emit single-character pieces each estimated at one
  // token — every one of them over the stated budget. No piece can fit a sub-1 budget, so the honest
  // answer is the same as `maxTokens <= 0`: an empty result the caller must read as "this cannot be
  // chunked" (the contract `splitToTokenBudget`'s JSDoc already states for that arm).
  expect(splitToTokenBudget("hello world", 0.5)).toEqual([]);
  expect(clampToTokenBudget("hello world", 0.5)).toBe("");
  expect(splitToTokenBudget("hello world", Number.NaN)).toEqual([]);
  expect(clampToTokenBudget("hello world", Number.NaN)).toBe("");
});

test("every piece of a fractional-adjacent budget still fits the FLOOR of that budget", () => {
  // 1.9 tokens is a 1-token budget: pieces must fit 1, never 1.9.
  const pieces = splitToTokenBudget("hello world this is a longer body", 1.9);
  expect(pieces.length).toBeGreaterThan(0);
  for (const piece of pieces) {
    expect(estimateTokens(piece)).toBeLessThanOrEqual(1);
  }
});
