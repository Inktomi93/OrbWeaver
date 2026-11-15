// @subject packages/kit/src/strings/index.ts
// A count read back the ways people type it off a model page, and every other text refused.
import { groupThousands, parseCount } from "@orb/kit/strings";
import { expect, test } from "@orb/testkit/node";

const READS = [
  ["1000000", 1_000_000],
  ["1,000,000", 1_000_000],
  ["1 000 000", 1_000_000],
  ["1_000_000", 1_000_000],
  ["  128000 ", 128_000],
  ["128k", 128_000],
  ["128K", 128_000],
  ["128 k", 128_000],
  ["1m", 1_000_000],
  ["1.5m", 1_500_000],
  ["1.1k", 1100],
] as const;

const REFUSED = ["", "0", "0k", "-5", "1.5", "0.0005k", "abc", "128 tokens", "1e6", "12kk", "k"] as const;

test("each typed form reads as the whole count it names", () => {
  for (const [typed, count] of READS) {
    expect(parseCount(typed), typed).toBe(count);
  }
});

test("text that names no whole count above zero is refused", () => {
  for (const typed of REFUSED) {
    expect(parseCount(typed), typed).toBeUndefined();
  }
});

test("a grouped count reads back to the number it was grouped from", () => {
  for (const count of [7, 8192, 32_768, 1_048_576]) {
    expect(parseCount(groupThousands(count))).toBe(count);
  }
});
