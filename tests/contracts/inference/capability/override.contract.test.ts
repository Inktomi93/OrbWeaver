// contracts/inference/capability/override — THE one shape for every capability statement that is not
// synthesized (a curated JSON row, a connection's `declared` block, a plugin manifest entry). Two properties
// are load-bearing. (1) `match` is an XOR: a regex over ids OR an explicit id list, never both and never
// neither — a row with both would have two selection semantics and whichever the compiler read first would
// win silently. (2) Every capability field is PARTIAL, because a higher evidence tier overrides only what it
// STATES; if `generation` demanded its required keys here, a curated row that measured one cell would have
// to restate a whole capability and would clobber the rest of the ladder.

import { capabilityOverrideSchema, declaredCapabilitySchema } from "@orb/contracts/inference";
import { expect, test } from "../../../support/fixtures.ts";

test("`match` is an XOR over `model` (a regex) and `ids`", () => {
  expect(capabilityOverrideSchema.safeParse({ match: { model: "^claude-" } }).success).toBe(true);
  expect(capabilityOverrideSchema.safeParse({ match: { ids: ["claude-opus-4"] } }).success).toBe(true);
  expect(capabilityOverrideSchema.safeParse({ match: { model: "^claude-", ids: ["claude-opus-4"] } }).success, "two selection semantics").toBe(false);
  expect(capabilityOverrideSchema.safeParse({ match: { wire: "anthropic-messages" } }).success, "a match must select SOMETHING").toBe(false);
  expect(capabilityOverrideSchema.safeParse({ match: { ids: [] } }).success).toBe(false);
});

test("a match may narrow by wire/api/provider, all from the closed vocabularies", () => {
  expect(capabilityOverrideSchema.safeParse({ match: { model: "^claude-", wire: "anthropic-messages", api: "anthropic-messages" } }).success).toBe(true);
  expect(capabilityOverrideSchema.safeParse({ match: { model: "^claude-", wire: "telepathy" } }).success).toBe(false);
  expect(capabilityOverrideSchema.safeParse({ match: { model: "^claude-", api: "completions" } }).success).toBe(false);
});

test("every capability field is PARTIAL — one measured cell is a legal row", () => {
  const oneCell = capabilityOverrideSchema.parse({ match: { ids: ["m"] }, generation: { reasoning: { replay: "signed" } } });
  expect(oneCell.generation?.reasoning).toEqual({ replay: "signed" });
  expect(capabilityOverrideSchema.safeParse({ generation: { turns: { assistantPrefill: true } } }).success, "a turns cell alone is a row").toBe(true);
  expect(capabilityOverrideSchema.safeParse({ embedding: { dims: 2048 } }).success).toBe(true);
  expect(capabilityOverrideSchema.safeParse({ rerank: { maxInputTokens: 8192 } }).success).toBe(true);
});

test("a partial cell's VALUES are still validated — partial widens the keys, never the vocabulary", () => {
  expect(capabilityOverrideSchema.safeParse({ generation: { reasoning: { replay: "verbatim" } } }).success).toBe(false);
  expect(capabilityOverrideSchema.safeParse({ embedding: { dims: -1 } }).success).toBe(false);
});

test("an `evidence` line is DATED and CITED when present", () => {
  expect(capabilityOverrideSchema.safeParse({ evidence: { tier: "measured", dated: "2026-09-19", cite: "req_abc" } }).success).toBe(true);
  expect(capabilityOverrideSchema.safeParse({ evidence: { tier: "measured", dated: "", cite: "req_abc" } }).success).toBe(false);
  expect(capabilityOverrideSchema.safeParse({ evidence: { tier: "hearsay", dated: "2026-09-19", cite: "x" } }).success).toBe(false);
});

test("a `declared` block carries no `match` and no `evidence` — it IS that row, at that tier", () => {
  const declared = declaredCapabilitySchema.parse({
    kind: "embedding",
    embedding: { dims: 2048 },
    match: { ids: ["not-mine"] },
    evidence: { tier: "measured", dated: "2026-09-19", cite: "x" },
  });
  expect(declared).not.toHaveProperty("match");
  expect(declared).not.toHaveProperty("evidence");
  expect(declared.embedding?.dims).toBe(2048);
});
