import { gate as automationCoverage } from "../../../../tooling/src/verify/gates/automation-bus-coverage.ts";
import { gate as chatCoverage } from "../../../../tooling/src/verify/gates/bus-coverage.ts";
import { gate as busFactHealth } from "../../../../tooling/src/verify/gates/bus-fact-health.ts";
import { gate as domainCoverage } from "../../../../tooling/src/verify/gates/domain-events-coverage.ts";
import { gate as rpgCoverage } from "../../../../tooling/src/verify/gates/rpg-bus-coverage.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("bus fact policies preserve their founding and nearest-legal fixtures", () => {
  expect(verifyPolicyProofs([automationCoverage, chatCoverage, busFactHealth, domainCoverage, rpgCoverage])).toEqual([]);
});
