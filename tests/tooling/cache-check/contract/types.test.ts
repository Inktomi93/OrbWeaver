import type { CaseVerdict } from "@orb/tooling/cache-check";
import { CASE_VERDICTS } from "@orb/tooling/cache-check";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("PASS/FAIL and SKIPPED/ERROR exactly partition CASE_VERDICTS, matching CaseOutcome's measured/unmeasured split", () => {
  const measured: readonly CaseVerdict[] = ["PASS", "FAIL"];
  const unmeasured: readonly CaseVerdict[] = ["SKIPPED", "ERROR"];
  expect([...measured, ...unmeasured].sort()).toEqual([...CASE_VERDICTS].sort());
});
