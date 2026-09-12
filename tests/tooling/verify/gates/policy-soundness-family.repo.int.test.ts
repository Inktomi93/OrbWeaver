// Conformance entry for the `policy-soundness` family (#1971) — the four final policies that enforce the
// mechanizable half of gate-runtime-standardization.md §5b over the gate corpus itself. Every declared row runs
// through the production dispatcher on an isolated population (`verifyPolicyProofs`); the pins below cover
// what a row structurally cannot express: the BLINDNESS refusals (a throw and a zero-count receipt are tool
// errors, not findings), the fixture-specifier resolution control, and the REAL-corpus control — a meta-policy
// over the gate corpus is exactly the shape that can sit at 0 conformance failures while reading nothing on
// the live tree (guide §5), so the recognizer's live count is checked against a second opinion.
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { POLICY_CONTRACT_PATH, POLICY_CONTRACT_STUB } from "../../../../tooling/src/verify/gates/_proof/policy-soundness.ts";
import { gate as policyLegacyImports } from "../../../../tooling/src/verify/gates/policy-legacy-imports.ts";
import { gate as policyProofExpectations } from "../../../../tooling/src/verify/gates/policy-proof-expectations.ts";
import { gate as policySoundness } from "../../../../tooling/src/verify/gates/policy-soundness.ts";
import { gate as policyWaiverIdentity } from "../../../../tooling/src/verify/gates/policy-waiver-identity.ts";
import { gate as policyWaiverSpelling } from "../../../../tooling/src/verify/gates/policy-waiver-spelling.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const FAMILY: readonly GatePolicy[] = [policyLegacyImports, policyProofExpectations, policySoundness, policyWaiverIdentity, policyWaiverSpelling];
/** The second opinion for `policy-legacy-imports`' live class: the one import shape the nine carriers share,
 *  restated as a text test so the arm's real-corpus findings are compared against something it did not compute. */
const LEGACY_CONTRACT_IMPORT_RE = /^import type \{[^}]*\} from "\.\.\/contract\/gate\.ts";$/mu;

const CONFORMANCE_TIMEOUT_MS = scaledBudget(300_000);
const PER_ROW_TIMEOUT_MS = scaledBudget(120_000);
/** The real-corpus arm parses ~330 files with types, resolves every `defineGate` callee to its import origin
 *  and runs `inspectGateContract`'s type-backed mutator identity over every final module — measured 180 s
 *  under the scoped runner beside a sibling suite on 2026-09-11; the parallel default of 5 s is a contention
 *  flake, not a verdict. */
const REAL_CORPUS_TIMEOUT_MS = scaledBudget(600_000);

const ROOT = "/policy-soundness-family";
const GATES_DIR = "tooling/src/verify/gates/";
/** The guide's own honest shape test for "converted" (§2): a bare `defineGate` grep overcounts by the
 *  modules that carry the word inside fixture strings and comments. Restated, not imported — the second opinion. */
const FINAL_SHAPE_RE = /^export const gate = defineGate\(/mu;
/** A corpus this small means the reader stopped reading the tree; the live corpus was 167 at mint. */
const MIN_FINAL_MODULES = 100;

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project: projectOf(files), reviewedGrants: [], failOnWarnings: false });
}

test(
  "the policy-soundness family keeps its founding, near-miss, scope and declared-limit fixtures",
  () => {
    expect(verifyPolicyProofs(FAMILY)).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);

// ---------------------------------------------------------------------------------------------------
// THE FIXTURE-SPECIFIER RESOLUTION CONTROL (the ordinary-visitors precedent): a relative import that resolves
// to NOTHING makes an identity row pass by fail-closure while conformance stays green. Every `../contract/
// policy.ts` in every row must reach the planted stub, and every family-test fixture must reach its module.
// ---------------------------------------------------------------------------------------------------
function danglingSpecifiers(files: readonly SourceFile[]): readonly string[] {
  return files
    .flatMap((sourceFile) => sourceFile.getImportDeclarations())
    .filter((declaration) => declaration.getModuleSpecifierValue().startsWith(".") && declaration.getModuleSpecifierSourceFile() === undefined)
    .map((declaration) => `${declaration.getSourceFile().getFilePath()} -> ${declaration.getModuleSpecifierValue()}`);
}

test(
  "every relative import in every proof of this family resolves inside the proof's own file map",
  () => {
    const shared = new Project({ useInMemoryFileSystem: true });
    const dangling: string[] = [];
    let sequence = 0;
    // `policy-legacy-imports` and E3's origin arm each carry ONE row whose relative import deliberately resolves
    // to nothing — the fail-closed UNREADABLE control — so the specifier-resolution control excludes exactly the
    // rows whose `why` declares that, and asserts the count of those it excused.
    let declaredUnreadable = 0;
    for (const policy of FAMILY) {
      for (const { proof } of policyProofRows(policy)) {
        sequence += 1;
        const root = `${ROOT}-proof-${sequence}`;
        const files = Object.entries(proof.files).map(([path, source]) => shared.createSourceFile(`${root}/${path}`, source));
        const rows = danglingSpecifiers(files).map((row) => `${policy.id}: ${row}`);
        if (/FAIL-CLOSED/u.test(proof.why)) {
          declaredUnreadable += rows.length;
        } else {
          dangling.push(...rows);
        }
        for (const file of files) {
          shared.removeSourceFile(file);
        }
      }
    }
    expect(dangling).toEqual([]);
    expect(declaredUnreadable).toBe(2);
    const declared = FAMILY.reduce((sum, policy) => sum + policyProofRows(policy).length, 0);
    expect(sequence).toBe(declared);
    expect(sequence).toBeGreaterThan(0);
  },
  PER_ROW_TIMEOUT_MS,
);

// ---------------------------------------------------------------------------------------------------
// BLINDNESS. A recognizer keyed on import origin dies silently when the contract moves: every module reads
// "not final" and the family reports ✓ over the corpus forever. Each policy self-anchors on its OWN module
// path, so the dead recognizer becomes a tool error; the entire-population member also receipts its count.
// ---------------------------------------------------------------------------------------------------
const LOOKALIKE = (id: string): string =>
  `function defineGate(policy: unknown): unknown {\n  return policy;\n}\nexport const gate = defineGate({ id: "${id}" });\n`;
const CANONICAL = (id: string): string => `import { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({ id: "${id}" });\n`;

for (const policy of FAMILY) {
  test(`${policy.id} REFUSES the run when its own module no longer reads as final, and runs when it does`, () => {
    const self = `${GATES_DIR}${policy.id}.ts`;
    const blind = passOf(policy, { [self]: LOOKALIKE(policy.id) });
    expect(blind.toolErrors).toMatchObject([{ policyId: policy.id, phase: "evaluate" }]);
    expect(blind.toolErrors[0]?.message).toContain("BLINDNESS");
    expect(blind.authority.withheldPolicyIds).toEqual([policy.id]);

    // The positive direction: the same module reached through the canonical contract is recognised, judged,
    // and (carrying nothing to flag) produces a clean, non-withheld run.
    const seeing = passOf(policy, { [POLICY_CONTRACT_PATH]: POLICY_CONTRACT_STUB, [self]: CANONICAL(policy.id) });
    expect(seeing.toolErrors).toEqual([]);
    expect(seeing.authority.withheldPolicyIds).toEqual([]);
    expect(seeing.authority.effectiveFindings).toEqual([]);
  });
}

test("policy-waiver-identity REFUSES a corpus in which it recognises no final module (the zero-count receipt)", () => {
  const legacyOnly = passOf(policyWaiverIdentity, {
    "tooling/src/verify/gates/legacy.ts": 'export const gate = { name: "legacy", docRow: "x", message: "m", mustFlag: [1], mustPass: [1] };\n',
  });
  expect(legacyOnly.toolErrors).toMatchObject([{ policyId: "policy-waiver-identity", phase: "receipt" }]);
  expect(legacyOnly.authority.withheldPolicyIds).toEqual(["policy-waiver-identity"]);
  expect(legacyOnly.authority.effectiveFindings).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// THE REAL CORPUS. Conformance runs on virtual projects with no real layout; a meta-policy over the gate
// corpus can be green there and blind here. The recognizer's live count is compared against the guide's own
// shape test, and the ERROR policy's three closed classes are asserted at zero on the tree they pin.
// ---------------------------------------------------------------------------------------------------
test(
  "the family reads the REAL gate corpus: no tool errors, nothing withheld, the recognized final count matches the shape test, and the closed classes are at zero",
  ({ repoRoot }) => {
    const project = getWorkspace({
      root: repoRoot,
      types: true,
      globs: [`${repoRoot}/tooling/src/verify/gates/*.ts`, `${repoRoot}/tests/tooling/verify/gates/*.ts`],
    });
    const result = runPolicyPass({ knownPolicies: FAMILY, policies: FAMILY, root: repoRoot, project, reviewedGrants: [], failOnWarnings: false });

    expect(result.factErrors).toEqual([]);
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.toolErrors).toEqual([]);
    expect(result.authority.withheldPolicyIds).toEqual([]);

    const shapeCount = project
      .getSourceFiles()
      .filter((sourceFile) => sourceFile.getFilePath().startsWith(`${repoRoot}/${GATES_DIR}`) && !sourceFile.getFilePath().includes("/_proof/"))
      .filter((sourceFile) => FINAL_SHAPE_RE.test(sourceFile.getFullText())).length;
    expect(shapeCount).toBeGreaterThan(MIN_FINAL_MODULES);
    const identity = result.policies.find(({ id }) => id === policyWaiverIdentity.id);
    expect(identity?.receipts).toEqual([{ kind: "population", source: "final policy modules", members: shapeCount, unresolved: 0 }]);

    // `policy-legacy-imports` is the one error policy whose class is OPEN on the tree (#1922's migration set).
    // Its live findings are compared against a SECOND OPINION — the import-shape text test over the same corpus
    // — so the arm's real-tree bite is measured by something it did not compute, and a hardcoded count never
    // rots into a false pin (#1969). A migration that lands moves BOTH sides to zero together.
    const secondOpinion = project
      .getSourceFiles()
      .filter((sourceFile) => sourceFile.getFilePath().startsWith(`${repoRoot}/${GATES_DIR}`) && !sourceFile.getFilePath().includes("/_proof/"))
      .filter((sourceFile) => FINAL_SHAPE_RE.test(sourceFile.getFullText()) && LEGACY_CONTRACT_IMPORT_RE.test(sourceFile.getFullText()))
      .map((sourceFile) => sourceFile.getFilePath().slice(repoRoot.length + 1))
      .toSorted();
    const accused = [
      ...new Set(result.authority.effectiveFindings.filter(({ policyId }) => policyId === policyLegacyImports.id).map(({ file }) => file)),
    ].toSorted();
    expect(accused).toEqual(secondOpinion);

    // The error policy pins its CLOSED classes; the tree is the proof they are closed. Asserted LAST so a red here
    // (a foreign module landing an unwrapped read, as `97e68be91` did for E4) still lets every receipt above print.
    expect(result.authority.effectiveFindings.filter(({ policyId }) => policyId === policySoundness.id)).toEqual([]);
  },
  REAL_CORPUS_TIMEOUT_MS,
);
