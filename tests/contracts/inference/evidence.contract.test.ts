// contracts/inference/evidence — THE capability evidence ladder. Every synthesis fold reads this ORDER, so
// the order IS the contract: `declared` (the user's own box) outranks `measured`, which outranks
// `advertised`, which outranks `curated`, which outranks the two code-side floors. Re-ordering the tuple
// silently re-decides every capability cell in the product — a dated measurement would start losing to a
// shipped guess — and nothing else on the tree would go red.

import { EVIDENCE_TIERS, evidenceTierSchema } from "@orb/contracts/inference";
import { expect, test } from "../../support/fixtures.ts";

test("the ladder is exactly this order, strongest first", () => {
  expect([...EVIDENCE_TIERS]).toEqual(["declared", "measured", "advertised", "curated", "family-floor", "kind-floor"]);
});

test("every member parses to itself and anything else is REFUSED", () => {
  for (const tier of EVIDENCE_TIERS) {
    expect(evidenceTierSchema.parse(tier)).toBe(tier);
  }
  for (const notATier of ["measured-2026", "user", "default", ""]) {
    expect(evidenceTierSchema.safeParse(notATier).success).toBe(false);
  }
});
