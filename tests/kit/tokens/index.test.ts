import { estimateTokens } from "@orb/kit/tokens";
import { expect, test } from "vitest";

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
