// contracts/inference/finish-reasons — the normalized "why did generation stop?" vocabulary. It is a
// PERSISTED value (`message_variants.finish_reason`, CHECK-enforced), so the closedness is the contract: a
// widening to `z.string()` would let a raw upstream word (`end_turn`, `max_tokens`, `tool_calls`) be stored
// as if it were normalized, and every reader that branches on `stop`/`length`/`tool` would silently stop
// matching. `other` is the NAMED arm for a recognised-but-unclassified value — its presence in the tuple is
// what keeps the per-wire fold from needing a fallthrough.

import { NORMALIZED_FINISH_REASONS, normalizedFinishReasonSchema } from "@orb/contracts/inference";
import { expect, test } from "../../support/fixtures.ts";

test("every member parses to itself", () => {
  for (const reason of NORMALIZED_FINISH_REASONS) {
    expect(normalizedFinishReasonSchema.parse(reason)).toBe(reason);
  }
});

test("a RAW upstream word is refused — normalization is not optional", () => {
  for (const raw of ["end_turn", "max_tokens", "tool_calls", "content_filter", "STOP", ""]) {
    expect(normalizedFinishReasonSchema.safeParse(raw).success, `"${raw}" is a wire word, not a normalized reason`).toBe(false);
  }
});

test("`other` exists as a NAMED arm — the fold never needs a fallthrough", () => {
  expect(NORMALIZED_FINISH_REASONS).toContain("other");
  expect(normalizedFinishReasonSchema.parse("other")).toBe("other");
});
