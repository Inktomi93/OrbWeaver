import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate } from "../../../../tooling/src/verify/gates/tests-raw-package-reach.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { WAIVER_BUDGET } from "../../../../tooling/src/verify/lib/waiver-budget.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("every declared proof row, the grant-witness rerun included, holds through production conformance", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the baselined grants are one row per test file and raw specifier, and the budget is the table's size", () => {
  const rows = REVIEWED_GRANTS.filter(({ policyId }) => policyId === gate.id);
  expect(rows.length).toBeGreaterThan(0);
  expect(new Set(rows.map(({ subject, operation }) => `${subject}|${operation}`)).size).toBe(rows.length);
  for (const row of rows) {
    expect(row.subject.startsWith("tests/"), row.id).toBe(true);
    expect(row.operation, row.id).toMatch(/^raw-reach:#[a-z-]+\/.+/u);
  }
  expect(WAIVER_BUDGET[gate.id]).toBe(rows.length);
});
