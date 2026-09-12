// The grouped, per-occurrence reporter (TSMORPH-SINGLE-PASS-AUDIT.md §9.3 + owner rulings 1/2): the
// dispatcher emits EXHAUSTIVE per-token findings carrying only {file,line,column,token}; the reporter
// GROUPS by gate → prints the reason (message + fix) ONCE as the group header → lists ALL occurrences
// beneath as clickable `path:line:col` + the offending token. This pins that grouped shape: reason once,
// every token under it, distinct columns per token.
import { Node, Project, SyntaxKind } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { FinalPolicyRow, StructurePolicyReport } from "../../../../tooling/src/verify/contract/structure-report.ts";
import type { GateDescriptor } from "../../../../tooling/src/verify/index.ts";
import { renderPass, runPass } from "../../../../tooling/src/verify/index.ts";
import { renderPolicyPass } from "../../../../tooling/src/verify/lib/render.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";

const PROOF = { files: "export const fixture = true;\n", why: "test-owned legacy adapter fixture" } as const;

const offTokenGate: GateDescriptor = {
  name: "no-off-token-radius-shadow",
  docRow: "test-owned",
  status: "active",
  scopeSafety: "incremental-safe",
  message: "off-token default-scale radius/shadow utility",
  fix: "rounded-lg → rounded-card",
  scanRoot: (path) => path.startsWith("packages/ui/") || path.startsWith("packages/client/"),
  kinds: [SyntaxKind.StringLiteral],
  visit: (node, _sourceFile, ctx): void => {
    if (!Node.isStringLiteral(node)) {
      return;
    }
    for (const token of ["rounded-lg", "shadow-md"]) {
      const offset = node.getText().indexOf(token);
      if (offset >= 0) {
        ctx.report(node, { token, offset });
      }
    }
  },
  mustFlag: [PROOF],
  mustPass: [PROOF],
};

const noCallerUserIdGate: GateDescriptor = {
  name: "no-caller-user-id",
  docRow: "test-owned",
  status: "active",
  scopeSafety: "incremental-safe",
  message: "callerUserId is forbidden",
  scanRoot: () => true,
  kinds: [SyntaxKind.Identifier],
  visit: (node, _sourceFile, ctx): void => {
    if (Node.isIdentifier(node) && node.getText() === "callerUserId") {
      ctx.report(node, { token: "callerUserId", offset: 0 });
    }
  },
  mustFlag: [PROOF],
  mustPass: [PROOF],
};

function render(files: Readonly<Record<string, string>>, opts?: { readonly zeroScanAlarm: boolean }): string {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [rel, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${rel}`, text);
  }
  const gates = [offTokenGate, noCallerUserIdGate];
  const result = runPass(gates, {
    root: ROOT,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  return renderPass(result, new Map(gates.map((g) => [g.name, g])), opts);
}

test("the reporter groups by gate, prints the reason ONCE, and lists every token as path:line:col", () => {
  const out = render({
    "packages/ui/src/overlay/dialog.tsx": 'export const A = <div className="rounded-lg shadow-md" />;\n',
    "packages/server/src/domain/chat/engine/turn.ts": "export function f(callerUserId: string) {}\n",
  });

  // Group header with the per-gate count + the reason once (message + fix), NOT repeated per occurrence.
  expect(out).toContain("✗ no-off-token-radius-shadow (2)");
  expect(out.match(/off-token default-scale radius\/shadow utility/gu)).toHaveLength(1);
  expect(out).toContain("fix: rounded-lg → rounded-card");

  // Both banned tokens listed as clickable jump-links with the offending token, at DISTINCT columns.
  expect(out).toContain("packages/ui/src/overlay/dialog.tsx:1:34  rounded-lg");
  expect(out).toContain("packages/ui/src/overlay/dialog.tsx:1:45  shadow-md");

  // The second gate is its own group with its own single reason.
  expect(out).toContain("✗ no-caller-user-id (1)");
  expect(out).toContain("packages/server/src/domain/chat/engine/turn.ts:1:19  callerUserId");

  expect(out).toContain("single-pass: 3 violation(s)");
});

test("a clean tree renders a ✓ per gate and a clean footer", () => {
  const out = render({
    "packages/ui/src/ok/ok.tsx": 'export const OK = <div className="rounded-card" />;\n',
  });
  expect(out).toContain("✓ no-off-token-radius-shadow");
  expect(out).toContain("✓ no-caller-user-id");
  expect(out).toContain("single-pass: clean");
});

// ── per-gate SCAN HEALTH (Codex GA-H-01) ──────────────────────────────────────────────────────────────
// A verdict with no denominator is unauditable: ✓ reads the same whether the gate examined the file or
// never saw it. Every gate line therefore carries `scanned <admitted>/<offered> files`.

test("every gate line carries the scan denominator behind its verdict", () => {
  const out = render({
    "packages/ui/src/ok/ok.tsx": 'export const OK = <div className="rounded-card" />;\n',
    "packages/server/src/domain/chat/engine/turn.ts": "export function f(userId: string) {}\n",
  });
  // The off-token gate is scoped to the UI/client class strings: one of the two files is in its scanRoot.
  expect(out).toContain("✓ no-off-token-radius-shadow  ·  scanned 1/2 files");
  // no-caller-user-id scans the whole packages+tests corpus: both files.
  expect(out).toContain("✓ no-caller-user-id  ·  scanned 2/2 files");
});

test("a gate that scanned NOTHING renders LOUD, not green — and is counted in the footer", () => {
  // The zero-scan placebo, planted with a REAL gate: hand the UI-scoped gate a tree with no UI file, so
  // its scanRoot admits nothing. Its ✓ would be vacuous — every scanRoot regression looks exactly like it.
  const out = render(
    {
      "packages/server/src/domain/chat/engine/turn.ts": "export function f(userId: string) {}\n",
    },
    { zeroScanAlarm: true },
  );
  expect(out).toContain("⚠ no-off-token-radius-shadow  ·  scanned 0/1 files — SCANNED ZERO FILES");
  expect(out).not.toContain("✓ no-off-token-radius-shadow");
  expect(out).toContain("single-pass: 1 gate(s) SCANNED ZERO FILES — the checker is BLIND, not clean");
  // The gate that DID read the file is untouched by the alarm.
  expect(out).toContain("✓ no-caller-user-id  ·  scanned 1/1 files");
});

test("the zero-scan alarm is OFF by default — a scoped run legitimately hands a gate no files", () => {
  const out = render({
    "packages/server/src/domain/chat/engine/turn.ts": "export function f(userId: string) {}\n",
  });
  expect(out).toContain("✓ no-off-token-radius-shadow  ·  scanned 0/1 files");
  expect(out).not.toContain("SCANNED ZERO FILES");
});

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

test("a PASSING policy's warning occurrences carry their own message too — there is no group header there at all", () => {
  const out = renderPolicyPass(
    [policyRow([{ file: "packages/client/src/a.ts", line: 4, column: 2, message: ARM_A, severity: "warning", token: "entry" }], true)],
    EMPTY_REPORT,
    [twoArmPolicy],
  );
  expect(out).toContain("  ✓ probe-two-arm (1 warning(s))");
  expect(out).toContain(`      packages/client/src/a.ts:4:2  entry  [warning]  — ${ARM_A}`);
});
