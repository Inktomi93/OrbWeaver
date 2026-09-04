// cpu-profile retains pure evidence/report helpers for Snap, but its independent lifecycle is retired.
// The barrel must expose the retained engine without resurrecting a parser, stage, or browser run path.
import { expect, test } from "../../support/tool-fixtures.ts";

test("the retained barrel exposes pure reports without restoring the retired lifecycle", async () => {
  const cpuProfile = await import("../../../tooling/src/cpu-profile/index.ts");

  expect(cpuProfile.buildReports).toBeTypeOf("function");
  expect(cpuProfile).not.toHaveProperty("parsePerfArgs");
  expect(cpuProfile).not.toHaveProperty("runPerfMeter");
  expect(cpuProfile).not.toHaveProperty("stagePerfMeter");
});
