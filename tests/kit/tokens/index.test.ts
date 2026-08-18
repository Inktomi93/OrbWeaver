import { clampToTokenBudget, estimateTokens, splitToTokenBudget } from "@orb/kit/tokens";
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
