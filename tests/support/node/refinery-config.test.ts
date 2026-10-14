// @subject tests/support/iso/refinery-config.ts

import { DEFAULT_REFINERY_STAGE_CONFIG } from "@orb/contracts/refinery";
import { makeRefineryStageConfig } from "@orb/testkit/iso/refinery-config.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("a stage mode override preserves its fixed provenance and sibling stages", () => {
  const config = makeRefineryStageConfig({ rewrite: { mode: "conservative" } });
  expect(config.rewrite).toEqual({ ...DEFAULT_REFINERY_STAGE_CONFIG.rewrite, mode: "conservative" });
  expect(config.score).toEqual(DEFAULT_REFINERY_STAGE_CONFIG.score);
  expect(config.analyze).toEqual(DEFAULT_REFINERY_STAGE_CONFIG.analyze);
});

test("switching to custom provenance without a genuine schema reference is refused", () => {
  expect(() => makeRefineryStageConfig({ score: { kind: "custom" } })).toThrow();
});
