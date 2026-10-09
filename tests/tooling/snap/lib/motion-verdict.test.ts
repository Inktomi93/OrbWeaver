import { timingCapability } from "../../../../tooling/src/_shared/timing-capability.ts";
import { motionFactState, motionStatus, motionTimingPolicy } from "../../../../tooling/src/snap/lib/motion-verdict.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("record-only measurement is neither a pass nor a failure, and semantic failures still win under load", () => {
  const recorded = { gaps: [], pass: true, timing: timingCapability({}), loadSuspect: null };
  expect(motionFactState(true, recorded)).toBe("recorded");
  expect(motionStatus(recorded)).toBe("RECORDED");
  expect(motionTimingPolicy(recorded)).toBe("record");
  const failed = { ...recorded, pass: false, loadSuspect: "planted host contention" };
  expect(motionFactState(true, failed)).toBe("failed");
  expect(motionStatus(failed)).toBe("FAIL");
  const gap = { ...recorded, gaps: [{ evidence: "collector", detail: "missing" }] };
  expect(motionFactState(true, gap)).toBe("refused");
  expect(motionStatus(gap)).toBe("REFUSED");
});

test("qualified timing can assert only while load also supports judgment", () => {
  const qualified = {
    gaps: [],
    pass: true,
    loadSuspect: null,
    timing: timingCapability({ ["ORB_TIMING_HARDWARE_CLASS"]: "inktomi-owner", ["ORB_TEST_CAPABILITIES"]: "stable-timing" }),
  };
  expect(motionFactState(true, qualified)).toBe("passed");
  expect(motionStatus(qualified)).toBe("PASS");
  expect(motionTimingPolicy(qualified)).toBe("assert");
  const loaded = { ...qualified, loadSuspect: "planted host contention" };
  expect(motionFactState(true, loaded)).toBe("load-suspect");
  expect(motionTimingPolicy(loaded)).toBe("record");
});
