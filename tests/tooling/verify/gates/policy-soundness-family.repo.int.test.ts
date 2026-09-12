// Conformance entry for the `policy-soundness` family (#1971, #2111) — the six final policies that enforce the
// mechanizable half of gate-runtime-standardization.md §5b over the gate corpus itself. Every declared row runs
// through the production dispatcher on an isolated population (`verifyPolicyProofs`); the pins below cover
// what a row structurally cannot express: the BLINDNESS refusals (a throw and a zero-count receipt are tool
// errors, not findings), the fixture-specifier resolution control, and the REAL-corpus control — a meta-policy
// over the gate corpus is exactly the shape that can sit at 0 conformance failures while reading nothing on
// the live tree (guide §5), so the recognizer's live count is checked against a second opinion.
import type { SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { POLICY_CONTRACT_PATH, POLICY_CONTRACT_STUB } from "../../../../tooling/src/verify/gates/_proof/policy-soundness.ts";
import { gate as policyBindingResolution } from "../../../../tooling/src/verify/gates/policy-binding-resolution.ts";
import { gate as policyFixtureSubstrate } from "../../../../tooling/src/verify/gates/policy-fixture-substrate.ts";
import { gate as policyLegacyImports } from "../../../../tooling/src/verify/gates/policy-legacy-imports.ts";
import { gate as policyProofExpectations } from "../../../../tooling/src/verify/gates/policy-proof-expectations.ts";
import { gate as policyRefusalCoverage } from "../../../../tooling/src/verify/gates/policy-refusal-coverage.ts";
import { gate as policySoundness } from "../../../../tooling/src/verify/gates/policy-soundness.ts";
import { gate as policyWaiverIdentity } from "../../../../tooling/src/verify/gates/policy-waiver-identity.ts";
import { gate as policyWaiverSpelling } from "../../../../tooling/src/verify/gates/policy-waiver-spelling.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const FAMILY: readonly GatePolicy[] = [
  policyBindingResolution,
  policyFixtureSubstrate,
  policyLegacyImports,
  policyProofExpectations,
  policyRefusalCoverage,
  policySoundness,
  policyWaiverIdentity,
  policyWaiverSpelling,
];
/** The second opinions for the two OPEN classes, restated as TEXT tests so each arm's real-corpus findings are
 *  compared against something the arm did not compute (#1969: a hardcoded count rots into a false pin).
 *  `policy-legacy-imports` ARM A: an import line whose specifier names one of the nine forbidden homes. */
const FORBIDDEN_HOME_IMPORT_RE =
  /^import (?:type )?\{[^}]*\} from "\.\.\/(?:contract\/gate|lib\/(?:pass|gate-ignore|reviewed-grants|ordinary-waiver|gate-authority|policy-pass|loader|policy-loader))\.ts";$/mu;
/** ARM B: a single-line import or re-export of a top-level sibling (`./<name>.ts`, never a subdirectory); whether
 *  the sibling REGISTERS is read off its text with the registration shapes below. */
const SIBLING_IMPORT_RE = /^(?:import|export) (?:type )?\{[^}]*\} from "\.\/([^/"]+)\.ts";$/gmu;
const REGISTERS_RE = /^export const gate(?::| =)/mu;
/** `policy-binding-resolution`: the members whose NAME alone is unambiguous (every one is declared only on a
 *  ts-morph node or symbol), so a module CALLING one must be accused; `getDeclarations` is ambiguous by name
 *  (`VariableStatement#getDeclarations` is a syntax accessor) and joins only the SUPERSET side. The census is
 *  SYNTACTIC — a member call in code position — because a text regex counts the member spelled inside fixture
 *  strings and comments (this very arm's own rows), the same overcount the guide records for `defineGate`. */
const UNAMBIGUOUS_RESOLUTION_MEMBERS: ReadonlySet<string> = new Set([
  "getDefinitionNodes",
  "getDefinitions",
  "findReferences",
  "findReferencesAsNodes",
  "getImplementations",
  "getAliasedSymbol",
  "getAliasedSymbolOrThrow",
  "getValueDeclaration",
  "getValueDeclarationOrThrow",
]);
const ANY_RESOLUTION_MEMBERS: ReadonlySet<string> = new Set([...UNAMBIGUOUS_RESOLUTION_MEMBERS, "getDeclarations"]);
/** Does the module CALL a member of `names` — `x.<name>(…)` in code position, never in a string or a comment? */
function callsMemberNamed(sourceFile: SourceFile, names: ReadonlySet<string>): boolean {
  return sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    const callee = call.getExpression();
    return Node.isPropertyAccessExpression(callee) && names.has(callee.getName());
  });
}

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
    // `policy-legacy-imports` (one per arm) and E3's origin arm each carry a row whose relative import deliberately
    // resolves to nothing — the fail-closed UNREADABLE control — so the specifier-resolution control excludes exactly
    // the rows whose `why` declares that, and asserts the count of those it excused.
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
    expect(declaredUnreadable).toBe(4);
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

/** `policy-fixture-substrate` cannot take the self-anchor arm and the reason is structural, not an omission: its
 *  population is the TEST tree (`tests/tooling/verify/gates/**`), so its own module never enters `ctx.files` and
 *  there is no self to anchor on. Its blindness is stated the other way the family already knows — a zero-count
 *  receipt — and pinned by its own test directly below this loop. */
const SELF_ANCHORED = FAMILY.filter((policy) => policy.id !== policyFixtureSubstrate.id);

for (const policy of SELF_ANCHORED) {
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

test("policy-fixture-substrate REFUSES a population it read NOTHING from, and runs when it reads a file (#2185)", () => {
  // THE BLIND DIRECTION. This policy's population is the TEST tree, so it has no own-module self-anchor; what
  // holds it is the resolver one level up, which refuses an effective population that admits nothing BEFORE any
  // hook runs. Measured: a zero-count receipt inside the module never executed, because this refusal fired first.
  const blind = passOf(policyFixtureSubstrate, {});
  expect(blind.toolErrors).toMatchObject([{ policyId: policyFixtureSubstrate.id, phase: "population" }]);
  expect(blind.toolErrors[0]?.message).toContain("candidate corpus is empty");
  expect(blind.authority.withheldPolicyIds).toEqual([policyFixtureSubstrate.id]);

  // THE SEEING DIRECTION, which is what makes the arm above a control rather than an unfailable assertion: one
  // real family-test file in the population, clean, no refusal.
  const seeing = passOf(policyFixtureSubstrate, {
    "tests/tooling/verify/gates/probe.test.ts": 'import { writeFileSync } from "node:fs";\nexport const w = (p: string): void => writeFileSync(p, "x");\n',
  });
  expect(seeing.toolErrors).toEqual([]);
  expect(seeing.authority.withheldPolicyIds).toEqual([]);
  expect(seeing.authority.effectiveFindings).toEqual([]);
});

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

    // `policy-legacy-imports` and `policy-binding-resolution` are the error policies whose classes are OPEN on the
    // tree (#1922's migration set + #2155; #2096's split families; #2097's local resolvers). Their live findings are
    // compared against SECOND OPINIONS — text tests over the same corpus — so each arm's real-tree bite is measured
    // by something it did not compute, and a hardcoded count never rots into a false pin (#1969). A migration that
    // lands moves both sides together.
    const finals = project
      .getSourceFiles()
      .filter((sourceFile) => sourceFile.getFilePath().startsWith(`${repoRoot}/${GATES_DIR}`) && !sourceFile.getFilePath().includes("/_proof/"))
      .filter((sourceFile) => FINAL_SHAPE_RE.test(sourceFile.getFullText()));
    const relative = (sourceFile: SourceFile): string => sourceFile.getFilePath().slice(repoRoot.length + 1);
    const accusedBy = (policyId: string): readonly string[] =>
      [...new Set(result.authority.effectiveFindings.filter((finding) => finding.policyId === policyId).map(({ file }) => file))].toSorted();
    const importsSiblingGate = (text: string): boolean =>
      [...text.matchAll(SIBLING_IMPORT_RE)].some((match) =>
        REGISTERS_RE.test(project.getSourceFile(`${repoRoot}/${GATES_DIR}${match[1]}.ts`)?.getFullText() ?? ""),
      );
    const importOpinion = finals
      .filter((sourceFile) => FORBIDDEN_HOME_IMPORT_RE.test(sourceFile.getFullText()) || importsSiblingGate(sourceFile.getFullText()))
      .map(relative)
      .toSorted();
    expect(accusedBy(policyLegacyImports.id)).toEqual(importOpinion);
    expect(importOpinion.length).toBeGreaterThan(0);
    // The resolution arm is two-sided by CONTAINMENT, not equality: every module the unambiguous spellings name must
    // be accused (the arm is not blind), and every accused module must carry some member's spelling (the arm is not
    // inventing) — `getDeclarations` alone cannot be judged by text, which is the whole reason the arm reads types.
    const resolutionAccused = accusedBy(policyBindingResolution.id);
    const unambiguous = finals
      .filter((sourceFile) => callsMemberNamed(sourceFile, UNAMBIGUOUS_RESOLUTION_MEMBERS))
      .map(relative)
      .toSorted();
    const anySpelling = new Set(finals.filter((sourceFile) => callsMemberNamed(sourceFile, ANY_RESOLUTION_MEMBERS)).map(relative));
    expect(unambiguous.filter((path) => !resolutionAccused.includes(path))).toEqual([]);
    expect(resolutionAccused.filter((path) => !anySpelling.has(path))).toEqual([]);
    expect(resolutionAccused.length).toBeGreaterThanOrEqual(unambiguous.length);
    expect(unambiguous.length).toBeGreaterThan(0);
    // And the family's own modules are CLEAN under the resolution arm: the enforcer never reds its host (#2097 —
    // `policy-soundness`'s three former chains read through the shared readers now).
    expect(resolutionAccused.filter((path) => FAMILY.some((policy) => path === `${GATES_DIR}${policy.id}.ts`))).toEqual([]);

    // The error policy pins its CLOSED classes; the tree is the proof they are closed. Asserted LAST so a red here
    // (a foreign module landing an unwrapped read, as `97e68be91` did for E4) still lets every receipt above print.
    expect(result.authority.effectiveFindings.filter(({ policyId }) => policyId === policySoundness.id)).toEqual([]);
  },
  REAL_CORPUS_TIMEOUT_MS,
);
