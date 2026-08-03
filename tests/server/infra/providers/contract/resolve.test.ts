// D68 slots on the resolved-chat contract (infra/providers/contract/resolve.ts): the `verbosity_dropped`
// WARNING_CODES member + the `ResolvedSampling.minP` / `ResolvedChatKnobs.verbosity` type fields. W1
// declares the slots; no funnel/runner reads them until W2 — so these assert the SLOT exists (the wire
// carriage the later waves build against), not any resolution behavior.
//
// resolve.ts is behind the providers contract barrel; reached by relative path (the local-light convention).

import type { ResolvedChatKnobs, ResolvedSampling } from "../../../../../packages/server/src/infra/providers/contract/resolve.ts";
import { DYNAMIC_CONTEXT_CHANNELS, WARNING_CODES } from "../../../../../packages/server/src/infra/providers/contract/resolve.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("WARNING_CODES carries the verbosity_dropped member (D68-B)", () => {
  expect(WARNING_CODES).toContain("verbosity_dropped");
});

test("WARNING_CODES carries the dynamic_context_demoted member (D66, W4)", () => {
  expect(WARNING_CODES).toContain("dynamic_context_demoted");
});

// The isError flag on a tool result has no slot on either OR chat dialect — the drop needs a code so it can
// be reported (D41 no-silent-degrade; docs/design/openrouter-provider-findings.md §4).
test("WARNING_CODES carries the tool_result_error_dropped member", () => {
  expect(WARNING_CODES).toContain("tool_result_error_dropped");
});

test("DYNAMIC_CONTEXT_CHANNELS is the two-member channel union (D66, W4)", () => {
  expect(DYNAMIC_CONTEXT_CHANNELS).toStrictEqual(["system-block", "message-tail"]);
});

test("ResolvedSampling has a minP slot + ResolvedChatKnobs a verbosity slot (D68-A/B)", () => {
  // Type-level slots proven by constructing values that inhabit them — a compile error here (the field
  // removed) is the RED signal a later wave broke the carriage.
  const sampling: ResolvedSampling = { minP: 0.05 };
  const knobs: ResolvedChatKnobs = {
    turnId: "test-turn",
    reasoning: { mode: "none", enabled: false },
    sampling,
    dynamicContextChannel: "system-block",
    verbosity: "low",
    warnings: [],
  };
  expect(knobs.sampling.minP).toBe(0.05);
  expect(knobs.verbosity).toBe("low");
});
