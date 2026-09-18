// The grouped, per-occurrence reporter (the retired TSMORPH-SINGLE-PASS-AUDIT audit §9.3 + owner rulings 1/2): the
// dispatcher emits EXHAUSTIVE per-token findings carrying only {file,line,column,token}; the reporter
// GROUPS by gate → prints the reason (message + fix) ONCE as the group header → lists ALL occurrences
// beneath as clickable `path:line:col` + the offending token. This pins that grouped shape: reason once,
// every token under it, distinct columns per token.
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { FinalPolicyRow, StructurePolicyReport } from "../../../../tooling/src/verify/contract/structure-report.ts";
import { renderPolicyPass } from "../../../../tooling/src/verify/lib/render.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

// ── per-gate SCAN HEALTH (Codex GA-H-01) ──────────────────────────────────────────────────────────────
// A verdict with no denominator is unauditable: ✓ reads the same whether the gate examined the file or
// never saw it. Every gate line therefore carries `scanned <admitted>/<offered> files`.

// ── the FINAL side: the per-finding message (#2002, owner arm A) ────────────────────────────────────────
// `lib/structure-report.ts` puts `finding.message ?? policy.message` on every violation and the group header
// prints `policy.message` ONCE, so before this the console showed ONE remedy for a policy with several arms
// while the per-arm text sat unread in the JSON — systematically the wrong remedy for some fraction of a
// multi-arm policy's findings, for every final policy, not just the one that was audited. The rule is
// DIFFERENCE: an equal message is already in the header and must not be repeated.
const POLICY_MESSAGE = "the umbrella: this module breaks one of two rules.";
const ARM_A = "ARM A: the entry is not registered — add it to the registry.";

const twoArmPolicy: GatePolicy = defineGate({
  id: "probe-two-arm",
  family: "probe",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: POLICY_MESSAGE,
  create: () => ({ evaluate: () => undefined }),
  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "unused here — the render pin never runs the proofs" }],
  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "y" }, why: "unused here — the render pin never runs the proofs" }],
});

const NO_TIMING = { totalMs: 0, phaseMs: { population: 0, create: 0, visitFile: 0, visit: 0, evaluate: 0, receipt: 0 } } as const;

function policyRow(violations: FinalPolicyRow["violations"], ok: boolean): FinalPolicyRow {
  return {
    contract: "final",
    name: "probe-two-arm",
    family: "probe",
    authority: "ordinary",
    severity: "error",
    workItem: null,
    ok,
    owner: { status: "success", population: "complete" },
    withheld: false,
    population: { declaredSourcePaths: 1, declaredResourcePaths: 0, effectiveSourcePaths: 1, effectiveResourcePaths: 0, requestedPaths: null },
    receipts: [],
    violations,
    waived: 0,
    granted: 0,
    timing: NO_TIMING,
  };
}

const EMPTY_REPORT: StructurePolicyReport = {
  facts: [],
  factErrors: [],
  toolErrors: [],
  waiverCarrierRefusals: [],
  authority: {
    alarms: [],
    toolErrors: [],
    withheldPolicyIds: [],
    ordinaryConsumption: [],
    reviewedGrantConsumption: [],
    verdict: { errors: 0, warnings: 0, blocking: 0, failOnWarnings: false },
  },
  timing: { totalMs: 0, policyMs: 0, factMs: 0 },
};

test("a failing policy's occurrence line carries the PER-FINDING message when it differs from the group header", () => {
  const out = renderPolicyPass(
    [
      policyRow(
        [
          { file: "packages/client/src/a.ts", line: 4, column: 2, message: ARM_A, severity: "error", token: "entry" },
          { file: "packages/client/src/b.ts", line: 9, column: 0, message: POLICY_MESSAGE, severity: "error" },
        ],
        false,
      ),
    ],
    EMPTY_REPORT,
    [twoArmPolicy],
  );
  // The header still prints the umbrella ONCE.
  expect(out).toContain(`      ${POLICY_MESSAGE}`);
  // Arm A's own remedy now reaches the person the gate fired on, on its own occurrence line.
  expect(out).toContain(`      packages/client/src/a.ts:4:2  entry  — ${ARM_A}`);
  // The finding that carries the policy's own message adds NOTHING — it is already in the header, and this
  // is what keeps every ordinary single-message policy's output byte-identical.
  expect(out).toContain("      packages/client/src/b.ts:9:0\n");
  expect(out.split("\n").filter((line) => line.includes(POLICY_MESSAGE))).toHaveLength(1);
});

// ARM 4's SUCCESSOR (#2176 Phase F). `check-gates.repo.int.test.ts` asserted "every FINAL policy reports
// the POPULATION DENOMINATOR behind its verdict" by scraping a real `check:structure` run; that suite
// retired with the `__g_` planters. The guarantee was never about the real tree — it is the RENDERER's, the
// final twin of the legacy scan-denominator pin above, and it is stronger here: the real-tree scrape could
// only ever assert the line's presence for policies that happened to run, while this one plants the row.
test("every FINAL policy line carries the POPULATION denominator behind its verdict — the same claim, the final vocabulary", () => {
  const passing = renderPolicyPass([policyRow([], true)], EMPTY_REPORT, [twoArmPolicy]);
  expect(passing).toContain("  ✓ probe-two-arm  ·  final ordinary/error · population 1 source · 0 resource");
  const failing = renderPolicyPass(
    [policyRow([{ file: "packages/client/src/a.ts", line: 1, column: 0, message: POLICY_MESSAGE, severity: "error" }], false)],
    EMPTY_REPORT,
    [twoArmPolicy],
  );
  expect(failing).toContain("  ✗ probe-two-arm (1)  ·  final ordinary/error · population 1 source · 0 resource");
});

test("a PASSING policy's warning occurrences carry their own message too — there is no group header there at all", () => {
  const out = renderPolicyPass(
    [policyRow([{ file: "packages/client/src/a.ts", line: 4, column: 2, message: ARM_A, severity: "warning", token: "entry" }], true)],
    EMPTY_REPORT,
    [twoArmPolicy],
  );
  expect(out).toContain("  ✓ probe-two-arm (1 warning(s))");
  expect(out).toContain(`      packages/client/src/a.ts:4:2  entry  [warning]  — ${ARM_A}`);
});
