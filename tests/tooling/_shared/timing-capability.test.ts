import { timingCapability, timingMeasurementResult } from "../../../tooling/src/_shared/timing-capability.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

const OWNER = { ["ORB_TIMING_HARDWARE_CLASS"]: "inktomi-owner", ["ORB_TEST_CAPABILITIES"]: "stable-timing" };

test("qualification requires a registered hardware class and explicit stable-timing capability", () => {
  expect(timingCapability(OWNER).policy).toBe("assert");
  for (const env of [
    {},
    { ["CI"]: "false" },
    { ["ORB_TIMING_HARDWARE_CLASS"]: "inktomi-owner" },
    { ["ORB_TEST_CAPABILITIES"]: "stable-timing" },
    { ...OWNER, ["ORB_TIMING_HARDWARE_CLASS"]: "arbitrary-box" },
  ]) {
    expect(timingCapability(env).policy).toBe("record");
  }
});

test("all GitHub contexts record timing and only an explicitly configured local class can qualify", () => {
  for (const runner of ["github-hosted", "self-hosted", ""]) {
    expect(timingCapability({ ...OWNER, ["GITHUB_ACTIONS"]: "true", ["RUNNER_ENVIRONMENT"]: runner }).policy).toBe("record");
  }
  expect(timingCapability({ ...OWNER, ["RUNNER_ENVIRONMENT"]: "self-hosted" }).policy).toBe("record");
  expect(timingCapability(OWNER).policy).toBe("assert");
});

test("the same over-budget number records on unnamed hardware and fails on qualified hardware", () => {
  const measurement = { metric: "blocking-ms", measured: 181, budget: 50 };
  expect(timingMeasurementResult(measurement, timingCapability({}))).toMatchObject({ ...measurement, overBudget: true, failed: false });
  expect(timingMeasurementResult(measurement, timingCapability(OWNER))).toMatchObject({ ...measurement, overBudget: true, failed: true });
  expect(timingMeasurementResult({ ...measurement, measured: 50 }, timingCapability(OWNER))).toMatchObject({ overBudget: false, failed: false });
});
