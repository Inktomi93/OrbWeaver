// Unit: the chip lists' typed form of a sequence (features/preset/lib/sequence-escapes). A DRY breaker or a
// stop sequence that is a newline must be typeable and readable, and the two directions must round-trip.

import { decodeSequence, encodeSequence } from "../../../../../packages/client/src/features/preset/lib/sequence-escapes.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("\\n, \\t and \\\\ type a newline, a tab and a backslash; other text is literal", () => {
  expect(decodeSequence("\\n")).toBe("\n");
  expect(decodeSequence("\\nUser:")).toBe("\nUser:");
  expect(decodeSequence("a\\tb")).toBe("a\tb");
  expect(decodeSequence("\\\\n")).toBe("\\n");
  expect(decodeSequence("<|im_end|>")).toBe("<|im_end|>");
  expect(decodeSequence("\\x")).toBe("\\x");
});

test("a stored sequence reads back in the form that types it", () => {
  for (const stored of ["\n", ":", '"', "*", "\nUser:", "a\tb", "back\\slash", "\\n"]) {
    expect(decodeSequence(encodeSequence(stored))).toBe(stored);
  }
});
