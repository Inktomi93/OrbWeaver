import { Project } from "ts-morph";
import type { GateDescriptor } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate as ordinary } from "../../../../tooling/src/verify/gates/stale-draft-commit.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/stale-draft-decision-health.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { DRAFT_DECISION_HOME, DRAFT_TREE_ANCHOR } from "../../../../tooling/src/verify/lib/stale-draft-read.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { frozenLegacyGate } from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/stale-draft-family";
const CELL = "packages/client/src/features/example/components/cell.tsx";
type Files = Readonly<Record<string, string>>;
function projectFor(files: Files): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, text);
  }
  return project;
}
function before(gate: GateDescriptor, files: Files): ReturnType<typeof runPass> {
  const project = projectFor(files);
  return runPass([gate], { root: ROOT, project, files: project.getSourceFiles(), scope: { kind: "project" }, checker: () => project.getTypeChecker() });
}
function after(files: Files, requestedPaths?: readonly string[]): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    root: ROOT,
    project: projectFor(files),
    knownPolicies: [ordinary, health],
    policies: [ordinary, health],
    reviewedGrants: [],
    failOnWarnings: false,
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
  });
}

test("draft occurrence and independent decision-home health proofs run through conformance", () => {
  expect(verifyPolicyProofs([ordinary, health])).toEqual([]);
});

test("all seven frozen draft rows preserve exact findings and observed source populations", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, "01f364760", "tooling/src/verify/gates/stale-draft-commit.ts");
  expect([legacy.mustFlag.length, legacy.mustPass.length]).toEqual([2, 5]);
  for (const arm of ["mustFlag", "mustPass"] as const) {
    for (const [index, example] of legacy[arm].entries()) {
      const files = typeof example.files === "string" ? { [example.at ?? CELL]: example.files } : example.files;
      // A decision-home source makes the health population measurable. It is inert on
      // the legacy detector, and its one additional admitted file is counted explicitly.
      const completed = { ...files, [DRAFT_DECISION_HOME]: "export {};" };
      const original = before(legacy, files);
      const old = before(legacy, completed);
      const next = after(completed);
      const expectedScanned = arm === "mustPass" && index === 4 ? 0 : 1;
      expect(original.toolErrors, example.why).toEqual([]);
      expect(old.toolErrors, example.why).toEqual([]);
      expect(next.toolErrors, example.why).toEqual([]);
      expect(next.factErrors, example.why).toEqual([]);
      expect(original.gates[0]?.scan.scanned, example.why).toBe(expectedScanned);
      expect(old.gates[0]?.scan.scanned, example.why).toBe(expectedScanned + 1);
      expect(old.gates[0]?.findings, example.why).toEqual(original.gates[0]?.findings);
      const findings = old.gates[0]?.findings ?? [];
      expect(findings, example.why).toHaveLength(arm === "mustFlag" ? 1 : 0);
      expect(
        next.authority.effectiveFindings.map(({ file, line, column, token, message }) => ({ file, line, column, token, message: message ?? ordinary.message })),
        example.why,
      ).toEqual(findings.map(({ file, line, column, token, message }) => ({ file, line, column, token, message: message ?? legacy.message })));
      expect(next.authority.authorityAlarms, example.why).toEqual([]);
      const owner = next.policies.find((policy) => policy.id === ordinary.id);
      expect(owner?.population.effectiveSourcePaths, example.why).toHaveLength(expectedScanned + 1);
      expect(owner?.population.effectiveResourcePaths, example.why).toEqual([]);
      expect(owner?.receipts, example.why).toContainEqual({
        kind: "population",
        source: "draft-commit-source-files",
        members: expectedScanned + 1,
        unresolved: 0,
      });
    }
  }
  expect(ordinary.message).toBe(legacy.message);
  assertFixIsLegacyPrefixPlusWaiverSpelling(ordinary.fix, legacy.fix);
});

// §7 item 3 (policy-waiver-spelling) added the exact `@orb-waive stale-draft-commit(<position>): <reason>`
// spelling onto the legacy remediation prose — a strengthening, not a predicate change, so the legacy text
// remains a PREFIX rather than the whole string. Split out so the frozen-rows test's own complexity stays
// within budget.
function assertFixIsLegacyPrefixPlusWaiverSpelling(ordinaryFix: string | undefined, legacyFix: string | undefined): void {
  const fix = ordinaryFix ?? "";
  expect(fix.startsWith(legacyFix ?? "")).toBe(true);
  expect(fix).toContain("@orb-waive stale-draft-commit(<position>): <reason>");
}

test("health retains the frozen missing-home arm with an admitted anchor and no waiver door", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, "01f364760", "tooling/src/verify/gates/stale-draft-commit.ts");
  const files = { [DRAFT_TREE_ANCHOR]: "export {};", [CELL]: "export {};" };
  const old = before(legacy, files);
  expect(old.toolErrors).toEqual([]);
  expect(old.gates[0]?.findings).toEqual([
    expect.objectContaining({
      file: "tooling/src/verify/gates/stale-draft-commit.ts",
      line: 1,
      column: 0,
      message: expect.stringContaining("no longer resolves"),
    }),
  ]);
  const next = after(files);
  expect(next.toolErrors).toEqual([]);
  expect(
    next.authority.effectiveFindings.map((finding) => ({
      policyId: finding.policyId,
      severity: finding.severity,
      file: finding.file,
      line: finding.line,
      column: finding.column,
      token: finding.token,
      message: finding.message ?? health.message,
      fix: finding.fix ?? health.fix,
    })),
  ).toEqual([
    {
      policyId: "stale-draft-decision-health",
      severity: "error",
      file: DRAFT_TREE_ANCHOR,
      line: 1,
      column: 1,
      token: undefined,
      message: "the draft decision home no longer resolves; restore packages/client/src/lib/edit-session.ts or retarget the diagnostic and remedy.",
      fix: "restore the EditSession/resolveCommit home or update the draft family to its replacement and preserve the concurrent-writer behavior.",
    },
  ]);
  const restored = after({ ...files, [DRAFT_DECISION_HOME]: "export {};" });
  expect(restored.authority.effectiveFindings).toEqual([]);
  for (const [result, sources] of [
    [next, [DRAFT_TREE_ANCHOR]],
    [restored, [DRAFT_DECISION_HOME, DRAFT_TREE_ANCHOR]],
  ] as const) {
    const owner = result.policies.find((policy) => policy.id === health.id);
    expect(owner?.population).toEqual({
      declaredSourcePaths: [...sources],
      declaredResourcePaths: [],
      requestedPaths: null,
      effectiveSourcePaths: [...sources],
      effectiveResourcePaths: [],
    });
    expect(owner?.receipts).toEqual([{ kind: "population", source: "draft-decision-health-sources", members: sources.length, unresolved: 0 }]);
  }
  const waived = after({ ...files, [DRAFT_TREE_ANCHOR]: "// @orb-waive stale-draft-decision-health(export): cannot license a missing home.\nexport {};" });
  expect(waived.authority.effectiveFindings).toHaveLength(1);
  expect(waived.authority.waivedFindings).toEqual([]);
});

test("ordinary occurrence remains selectable while whole-population health defers", () => {
  const source = "const [draft] = useState(source);\nif (draft !== source) save(draft);";
  const files = { [CELL]: source, [DRAFT_DECISION_HOME]: "export {};", [DRAFT_TREE_ANCHOR]: "export {};" };
  const selected = after(files, [CELL]);
  expect(selected.toolErrors).toEqual([]);
  expect(selected.policies.find((policy) => policy.id === health.id)?.owner).toMatchObject({
    status: "not-applicable",
    reason: "requested selection has an empty policy intersection",
  });
  expect(after(files, [CELL, DRAFT_TREE_ANCHOR]).policies.find((policy) => policy.id === health.id)?.owner).toMatchObject({
    status: "not-applicable",
    reason: "entire-population policy deferred for a proper subset selection",
  });
  expect(selected.authority.effectiveFindings).toEqual([expect.objectContaining({ policyId: ordinary.id, file: CELL, token: "draft" })]);
  const licensed = after({ ...files, [CELL]: source.replace("\nif", "\n// @orb-waive stale-draft-commit(draft): measured concurrent writer policy.\nif") }, [
    CELL,
  ]);
  expect(licensed.authority.effectiveFindings).toEqual([]);
  expect(licensed.authority.waivedFindings).toHaveLength(1);
});
