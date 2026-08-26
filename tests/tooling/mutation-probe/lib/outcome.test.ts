import { classifySuiteExit } from "../../../../tooling/src/mutation-probe/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("a red suite is a kill and a green suite is a survivor", () => {
  expect(classifySuiteExit(1)).toBe("killed");
  expect(classifySuiteExit(0)).toBe("survived");
});

// THE RED-FIRST PIN. The obvious spelling is `status !== 0`, and `null !== 0` is true — so a suite the
// wall-clock ceiling KILLED (an infinite-loop mutant is the standing cause) was scored as though the
// tests had caught it. That hides a real survivor behind a confident kill.
test("a timeout-killed suite is UNMEASURED, never a kill", () => {
  expect(classifySuiteExit(null)).toBe("unmeasured");
  expect(classifySuiteExit(null)).not.toBe("killed");
});
