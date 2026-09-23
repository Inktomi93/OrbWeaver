// infra/extraction/normalize — the §2 normalization pipeline. Pins the exact
// transforms every loader's output goes through: BOM strip, CRLF/CR → \n, NFC, 3+-blank-line collapse, and
// the two invariants that keep the text canon (no intra-line trim, no case folding).

import { normalizeText } from "../../../../packages/server/src/infra/extraction/normalize.ts";
import { expect, test } from "../../../support/fixtures.ts";

const BOM = "\uFEFF";

test("CRLF and lone CR both normalize to \\n", () => {
  expect(normalizeText("a\r\nb\rc")).toBe("a\nb\nc");
});

test("strips a leading UTF-8 BOM (only at the start)", () => {
  expect(normalizeText(`${BOM}hello`)).toBe("hello");
  // a BOM mid-text is a real zero-width char, not a leading mark — left alone.
  expect(normalizeText(`a${BOM}b`)).toBe(`a${BOM}b`);
});

test("NFC-normalizes decomposed sequences to composed", () => {
  const decomposed = "e\u0301"; // e + combining acute accent
  const composed = "\u00e9"; // é
  expect(decomposed).not.toBe(composed);
  expect(normalizeText(decomposed)).toBe(composed);
});

test("collapses 3+ consecutive blank lines to one blank line, keeps 1–2", () => {
  expect(normalizeText("a\n\n\n\n\n\nb")).toBe("a\n\nb"); // 5 blank lines → 1
  expect(normalizeText("a\n\n\n\nb")).toBe("a\n\nb"); // 3 blank lines → 1
  expect(normalizeText("a\n\n\nb")).toBe("a\n\n\nb"); // 2 blank lines preserved
  expect(normalizeText("a\n\nb")).toBe("a\n\nb"); // 1 blank line preserved
});

test("does NOT trim inside lines or case-fold — the text is canon", () => {
  expect(normalizeText("  Padded  Line  ")).toBe("  Padded  Line  ");
  expect(normalizeText("MixedCase KEPT")).toBe("MixedCase KEPT");
});
