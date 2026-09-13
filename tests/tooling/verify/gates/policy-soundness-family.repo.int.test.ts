// Conformance entry for the `policy-soundness` family (#1971, #2111) — the final policies that enforce the
// mechanizable half of gate-runtime-standardization.md §7 over the gate corpus itself. Every declared row runs
// through the production dispatcher on an isolated population (`verifyPolicyProofs`). The family pins add
// the BLINDNESS refusal's withheld-owner and seeing-twin assertions, the fixture-specifier resolution
// control, and the REAL-corpus control — a meta-policy
// over the gate corpus is exactly the shape that can sit at 0 conformance failures while reading nothing on
// the live tree (guide §6.6), so the recognizer's live count is checked against a second opinion.
//
// AND A SECOND OPINION CAN BE GREEN FOR THE WRONG REASON (#2274). `policy-refusal-coverage`'s was one-sided
// containment — "every module whose text owes a pin is accused" — which held TRIVIALLY for a week because the
// arm's test half could discharge nothing at all. It is now TWO-SIDED, and the second side is computed by a
// PREDICATE THIS FILE OWNS: over the family-test tree (`FAMILY_TESTS_DIR`), a file mentioning the dispatcher
// NAME (`DISPATCHER_NAME`) pins the gate modules its IMPORT SPECIFIERS name (`GATE_MODULE_IMPORT_RE`); where a
// file names exactly ONE, the attribution is exact and that module MUST be discharged. Specifiers, never the
// module graph — the arm it judges walks the graph, so an opinion that walked it too would agree by
// construction. Restore the pre-#2274 reader and the NOT-DEAD assertion is the one that reds.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { finalProbeModule, ORDINARY_TRUNK, POLICY_CONTRACT_PATH, POLICY_CONTRACT_STUB } from "../../../../tooling/src/verify/gates/_proof/policy-soundness.ts";
import { gate as policyBindingResolution } from "../../../../tooling/src/verify/gates/policy-binding-resolution.ts";
import { gate as policyFamilyReaders } from "../../../../tooling/src/verify/gates/policy-family-readers.ts";
import { gate as policyFixtureSubstrate } from "../../../../tooling/src/verify/gates/policy-fixture-substrate.ts";
import { gate as policyLegacyImports } from "../../../../tooling/src/verify/gates/policy-legacy-imports.ts";
import { gate as policyProofExpectations } from "../../../../tooling/src/verify/gates/policy-proof-expectations.ts";
import { gate as policyRefusalCoverage } from "../../../../tooling/src/verify/gates/policy-refusal-coverage.ts";
import { gate as policySoundness } from "../../../../tooling/src/verify/gates/policy-soundness.ts";
import { gate as policyWaiverIdentity } from "../../../../tooling/src/verify/gates/policy-waiver-identity.ts";
import { gate as policyWaiverSpelling } from "../../../../tooling/src/verify/gates/policy-waiver-spelling.ts";
import { loadMixedGateCorpus } from "../../../../tooling/src/verify/lib/loader.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const FAMILY: readonly GatePolicy[] = [
  policyBindingResolution,
  policyFamilyReaders,
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
/** The PIN half of that opinion (#2274), also text: the family-test tree, the dispatcher's name, and the gate
 *  modules a test file imports. Deliberately a regex over the specifier rather than the module graph — the arm
 *  it judges walks the graph, so an opinion that walked it too would agree with the reader by construction. */
const FAMILY_TESTS_DIR = "tests/tooling/verify/gates/";
const DISPATCHER_NAME = "runPolicyPass";
const GATE_MODULE_IMPORT_RE = /from "(?:\.\.\/)+tooling\/src\/verify\/gates\/([a-z0-9-]+)\.ts"/gu;
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

test("policy-proof-expectations reads the actual package vocabulary and refuses an opaque effect on its source", ({ repoRoot }) => {
  const policyPath = "tooling/src/verify/gates/test-layout.ts";
  const vocabularyPath = "tooling/src/_shared/project-worlds.ts";
  const files = {
    [POLICY_CONTRACT_PATH]: POLICY_CONTRACT_STUB,
    [policyPath]: readFileSync(join(repoRoot, policyPath), "utf8"),
    [vocabularyPath]: readFileSync(join(repoRoot, vocabularyPath), "utf8"),
    "tooling/src/_shared/test-kinds.ts": readFileSync(join(repoRoot, "tooling/src/_shared/test-kinds.ts"), "utf8"),
  };
  const assertComplete = (result: ReturnType<typeof runPolicyPass>): void => {
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.toolErrors).toEqual([]);
    expect(result.authority.authorityAlarms).toEqual([]);
    expect(result.policies.map(({ owner }) => owner)).toEqual([{ status: "success", population: "complete" }]);
  };
  const clean = passOf(policyProofExpectations, files);
  assertComplete(clean);
  expect(clean.authority.effectiveFindings).toEqual([]);

  const changedVocabulary = files[vocabularyPath].replace(
    "export const PACKAGE_WORLDS:",
    "declare function opaque(value: unknown): void;\nopaque(PACKAGE_WORLD_DEFINITIONS);\nexport const PACKAGE_WORLDS:",
  );
  expect(changedVocabulary).not.toBe(files[vocabularyPath]);
  const affected = passOf(policyProofExpectations, { ...files, [vocabularyPath]: changedVocabulary });
  assertComplete(affected);
  expect(affected.authority.effectiveFindings).toHaveLength(1);
  expect(affected.authority.effectiveFindings[0]).toMatchObject({ file: policyPath, token: "messageIncludes" });
  expect(affected.authority.effectiveFindings[0]?.message).toContain("not statically readable");
});

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

// The §4.2 DISCRIMINATION CONTROL for `policy-refusal-coverage` (#2184). The module carries the POSITIVE arm
// in-module (a `mustPass` whose fixture holds the correct marker); the negative half CANNOT live there —
// under `knownPolicies: [policy]` a marker naming an unknown position rides the unknown-policy short-circuit
// and proves nothing, which is exactly the trap §4.2 names. So it runs HERE, against the WHOLE family as
// `knownPolicies`, where a dead position is reconciled and alarms. Without this the positive arm passes on a
// spelling that names nothing, and the escape hatch the `ordinary` tier promises is unreachable in practice.
const REFUSAL_COVERAGE_PROBE = (marker: string): Readonly<Record<string, string>> => ({
  [POLICY_CONTRACT_PATH]: POLICY_CONTRACT_STUB,
  "tooling/src/verify/gates/probe.ts": finalProbeModule(
    `${ORDINARY_TRUNK.replace(
      "resources: [],",
      `${marker}\n  resources: [{ kind: "tracked", why: "the planted probe's derived population" }],`,
    )}\n  fix: "f",\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "y" }, why: "w" }],`,
  ),
});

test("policy-refusal-coverage: the REPORTED position suppresses, a DEAD position ALARMS (§4.2 discrimination)", () => {
  const drive = (marker: string): ReturnType<typeof runPolicyPass> =>
    runPolicyPass({
      // THE WHOLE FAMILY as knownPolicies — the one thing that makes the negative arm mean anything.
      knownPolicies: FAMILY,
      policies: [policyRefusalCoverage],
      root: ROOT,
      project: projectOf(REFUSAL_COVERAGE_PROBE(marker)),
      reviewedGrants: [],
      failOnWarnings: false,
    });

  const correct = drive("// @orb-waive policy-refusal-coverage(resources): the planted probe defers its pin; ends when it carries a mustRefuse row.");
  expect(correct.authority.effectiveFindings).toEqual([]);
  expect(correct.authority.waivedFindings).toHaveLength(1);
  expect(correct.authority.authorityAlarms).toEqual([]);

  // A marker naming a position this policy never reports is a DEAD position: it suppresses nothing and it
  // ALARMS. All three assertions, per §4.2 — a pin that checked only the finding count would pass an
  // over-broad or duplicate marker, both of which alarm without moving that count.
  const dead = drive("// @orb-waive policy-refusal-coverage(nosuchposition): names a position the policy never reports.");
  expect(dead.authority.authorityAlarms).toHaveLength(1);
  expect(dead.authority.waivedFindings).toEqual([]);
  expect(dead.authority.effectiveFindings).toHaveLength(1);
});

// #2342: array syntax cannot stand in for the declared dependency/refusal value. These are selected
// production passes with authored expected outcomes; the static reader never computes its own oracle.
interface RefusalArrayProbe {
  readonly resourceDeclaration?: string;
  readonly resources?: string;
  readonly facts?: string;
  readonly mustRefuse?: string;
  readonly prelude?: string;
  readonly files?: Readonly<Record<string, string>>;
  readonly familyPin?: boolean;
}
const REFUSAL_ARRAY_RESOURCE = '[{ kind: "tracked-files" }]';
const REFUSAL_ARRAY_ROW =
  '[{ mode: "source", files: { "packages/client/src/probe.ts": "x" }, expect: { messageIncludes: "probe dependency missing" }, why: "refusal" }]';

function refusalArrayFiles(shape: RefusalArrayProbe): Readonly<Record<string, string>> {
  const fields = ORDINARY_TRUNK.replace("resources: [],", shape.resourceDeclaration ?? `resources: ${shape.resources ?? "[]"},`).replace(
    "facts: [],",
    `facts: ${shape.facts ?? "[]"},`,
  );
  const refusal = shape.mustRefuse === undefined ? "" : `mustRefuse: ${shape.mustRefuse},`;
  const files: Record<string, string> = {
    [POLICY_CONTRACT_PATH]: POLICY_CONTRACT_STUB,
    [`${GATES_DIR}${policyRefusalCoverage.id}.ts`]: CANONICAL(policyRefusalCoverage.id),
    [`${GATES_DIR}probe.ts`]: finalProbeModule(
      `${fields}\n fix: "f",\n mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "y" }, why: "w" }],\n${refusal}`,
      shape.prelude,
    ),
    ...shape.files,
  };
  if (shape.familyPin === true) {
    files["tests/tooling/verify/gates/probe-family.test.ts"] =
      'import { gate as probe } from "../../../../tooling/src/verify/gates/probe.ts";\n' +
      "declare function runPolicyPass(input: { policies: readonly unknown[] }): unknown;\nrunPolicyPass({ policies: [probe] });\n";
  }
  return files;
}

function refusalArrayResult(shape: RefusalArrayProbe): readonly { readonly token: string | undefined; readonly unreadable: boolean }[] {
  const result = passOf(policyRefusalCoverage, refusalArrayFiles(shape));
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.toolErrors).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
  expect(result.policies.map(({ owner }) => owner)).toEqual([{ status: "success", population: "complete" }]);
  return result.authority.effectiveFindings.map(({ token, message }) => ({ token, unreadable: message?.includes("not statically readable") === true }));
}

for (const [name, shape] of [
  ["direct", { resources: REFUSAL_ARRAY_RESOURCE }],
  ["const", { prelude: `const INPUTS = ${REFUSAL_ARRAY_RESOURCE};\n`, resources: "INPUTS" }],
  ["wrapped const", { prelude: `const INPUTS = ${REFUSAL_ARRAY_RESOURCE} as const;\n`, resources: "(INPUTS satisfies readonly unknown[])" }],
  ["spread", { prelude: `const INPUTS = ${REFUSAL_ARRAY_RESOURCE};\n`, resources: "[...INPUTS]" }],
  [
    "import through re-export",
    {
      prelude: 'import { RENAMED as INPUTS } from "../lib/refusal-array-barrel.ts";\n',
      resources: "INPUTS",
      files: {
        "tooling/src/verify/lib/refusal-array-source.ts": `export const INPUTS = ${REFUSAL_ARRAY_RESOURCE};\n`,
        "tooling/src/verify/lib/refusal-array-barrel.ts": 'export { INPUTS as RENAMED } from "./refusal-array-source.ts";\n',
      },
    },
  ],
] as const) {
  test(`policy-refusal-coverage reads nonempty ${name} dependencies (#2342)`, () =>
    expect(refusalArrayResult(shape)).toEqual([{ token: "resources", unreadable: false }]));
  test(`policy-refusal-coverage credits the real family pin for ${name} dependencies (#2342)`, () =>
    expect(refusalArrayResult({ ...shape, familyPin: true })).toEqual([]));
}

for (const [name, shape] of [
  ["direct", {}],
  ["const", { prelude: "const EMPTY = [];\n", resources: "EMPTY" }],
  ["spread", { prelude: "const EMPTY = [];\n", resources: "[...EMPTY]" }],
  [
    "import",
    {
      prelude: 'import { EMPTY } from "../lib/refusal-array-source.ts";\n',
      resources: "EMPTY",
      files: { "tooling/src/verify/lib/refusal-array-source.ts": "export const EMPTY = [];\n" },
    },
  ],
] as const) {
  test(`policy-refusal-coverage leaves empty ${name} dependencies unaccused (#2342)`, () => expect(refusalArrayResult(shape)).toEqual([]));
}

for (const [name, mustRefuse, prelude] of [
  ["direct", REFUSAL_ARRAY_ROW, ""],
  ["const", "ROWS", `const ROWS = ${REFUSAL_ARRAY_ROW};\n`],
  ["spread", "[...ROWS]", `const ROWS = ${REFUSAL_ARRAY_ROW};\n`],
] as const) {
  test(`policy-refusal-coverage credits nonempty ${name} refusal rows (#2342)`, () =>
    expect(refusalArrayResult({ resources: REFUSAL_ARRAY_RESOURCE, mustRefuse, prelude })).toEqual([]));
}

test("policy-refusal-coverage never credits an empty spread as a refusal row (#2342)", () =>
  expect(refusalArrayResult({ resources: REFUSAL_ARRAY_RESOURCE, prelude: "const EMPTY = [];\n", mustRefuse: "[...EMPTY]" })).toEqual([
    { token: "resources", unreadable: false },
  ]));

for (const resources of ['[{ kind: "tracked-files" }, ...inputs()]', '[...inputs(), { kind: "tracked-files" }]']) {
  test(`policy-refusal-coverage proves partial array presence for ${resources} (#2342)`, () => {
    const shape = { prelude: "declare function inputs(): readonly unknown[];\n", resources };
    expect(refusalArrayResult(shape)).toEqual([{ token: "resources", unreadable: false }]);
    expect(refusalArrayResult({ ...shape, familyPin: true })).toEqual([]);
  });
}

for (const [name, shape] of [
  ["unknown only", { prelude: "declare function inputs(): readonly unknown[];\n", resources: "[...inputs()]" }],
  ["known head and hole", { resources: '[{ kind: "tracked-files" }, ,]' }],
  ["unknown prefix and later hole", { prelude: "declare function inputs(): readonly unknown[];\n", resources: '[...inputs(), { kind: "tracked-files" }, ,]' }],
  ["known head and cycle", { prelude: 'const INPUTS = [{ kind: "tracked-files" }, ...INPUTS];\n', resources: "INPUTS" }],
  ["effectful authored spread", { prelude: "const TAIL = []; TAIL.forEach(() => 1);\n", resources: '[{ kind: "tracked-files" }, ...TAIL]' }],
  ["known head and missing import", { prelude: 'import { MISSING } from "../lib/missing-array.ts";\n', resources: '[{ kind: "tracked-files" }, ...MISSING]' }],
  [
    "opaque partial alias",
    {
      prelude: 'declare function inputs(): readonly unknown[];\nconst INPUTS = [{ kind: "tracked-files" }, ...inputs()];\nopaque(INPUTS);\n',
      resources: "INPUTS",
    },
  ],
  [
    "mutable partial alias",
    { prelude: 'declare function inputs(): readonly unknown[];\nlet INPUTS = [{ kind: "tracked-files" }, ...inputs()];\n', resources: "INPUTS" },
  ],
] as const) {
  test(`policy-refusal-coverage never hides ${name} behind partial presence (#2342)`, () =>
    expect(refusalArrayResult({ ...shape, familyPin: true })).toEqual([{ token: "resources", unreadable: true }]));
}

for (const [name, shape] of [
  ["dynamic call", { prelude: "declare function inputs(): readonly unknown[];\n", resources: "inputs()" }],
  ["opaque empty input", { prelude: "const INPUTS = [];\ndeclare function opaque(value: unknown): void;\nopaque(INPUTS);\n", resources: "INPUTS" }],
  ["callback mutation", { prelude: 'const INPUTS = [];\nINPUTS.forEach(() => INPUTS.push({ kind: "tracked-files" }));\n', resources: "INPUTS" }],
  ["explicit write", { prelude: "const INPUTS = [];\nINPUTS.length = 1;\n", resources: "INPUTS" }],
  ["spread cycle", { prelude: "const INPUTS = [...INPUTS];\n", resources: "INPUTS" }],
  ["hole", { resources: "[,]" }],
] as const) {
  test(`policy-refusal-coverage refuses unreadable ${name} despite a family pin (#2342)`, () =>
    expect(refusalArrayResult({ ...shape, familyPin: true })).toEqual([{ token: "resources", unreadable: true }]));
}

test("policy-refusal-coverage refuses unreadable refusal rows despite a family pin (#2342)", () =>
  expect(
    refusalArrayResult({
      resources: REFUSAL_ARRAY_RESOURCE,
      prelude: "declare function rows(): readonly unknown[];\n",
      mustRefuse: "rows()",
      familyPin: true,
    }),
  ).toEqual([{ token: "mustRefuse", unreadable: true }]));

for (const declaration of ["get resources() { return []; },", "resources() { return []; },"]) {
  test(`policy-refusal-coverage does not lose a present accessor/method declaration: ${declaration} (#2342)`, () =>
    expect(refusalArrayResult({ resourceDeclaration: declaration, familyPin: true })).toEqual([{ token: "resources", unreadable: true }]));
}

test("policy-refusal-coverage reads an imported refusal array and a shorthand dependency (#2342)", () =>
  expect(
    refusalArrayResult({
      prelude: `import { ROWS } from "../lib/refusal-array-source.ts";\nconst resources = ${REFUSAL_ARRAY_RESOURCE};\n`,
      resourceDeclaration: "resources,",
      mustRefuse: "ROWS",
      files: { "tooling/src/verify/lib/refusal-array-source.ts": `export const ROWS = ${REFUSAL_ARRAY_ROW};\n` },
    }),
  ).toEqual([]));

test("policy-refusal-coverage keeps canonical fact-provider elements opaque and attributes facts (#2342)", ({ repoRoot }) => {
  const path = "tooling/src/verify/contract/fact.ts";
  expect(
    refusalArrayResult({
      prelude:
        'import { defineFact } from "../contract/fact.ts";\n' +
        'const provider = defineFact({ id: "probe-fact", population: "@client", analysis: "syntax", resources: [], create: () => ({ finish: () => 1 }) });\n' +
        "const INPUTS = [provider];\n",
      facts: "INPUTS",
      files: { [path]: readFileSync(join(repoRoot, path), "utf8") },
    }),
  ).toEqual([{ token: "facts", unreadable: false }]);
});

test("policy-refusal-coverage rejects a same-spelled field on an unrelated object as an array-use endpoint (#2342)", () =>
  expect(
    refusalArrayResult({
      prelude: "const INPUTS = [];\nconst unrelated = { resources: INPUTS };\n",
      resources: "INPUTS",
    }),
  ).toEqual([{ token: "resources", unreadable: true }]));
// The §4.2 DISCRIMINATION CONTROL for `policy-family-readers` (#2187), the same shape and for the same
// reason: its POSITIVE arm is a `mustPass` in the module, and the negative half cannot live there because
// `knownPolicies: [policy]` short-circuits an unknown position. Three members so exactly ONE is isolated —
// in a PAIR both members are accused (sharing is symmetric) and the marker in one file would leave the
// other's finding standing, which is a red about the fixture rather than about waiver identity.
const FAMILY_READERS_PROBE = (marker: string): Readonly<Record<string, string>> => ({
  [POLICY_CONTRACT_PATH]: POLICY_CONTRACT_STUB,
  "tooling/src/verify/lib/shared-probe.ts": "export function readShared(value: unknown): unknown {\n  return value;\n}\n",
  "tooling/src/verify/gates/probe.ts": finalProbeModule(
    `${ORDINARY_TRUNK}\n  fix: "f",\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "y" }, why: "w" }],`,
  ).replace('family: "probe",', `${marker}\n  family: "trio",`),
  "tooling/src/verify/gates/trio-a.ts":
    'import { readShared } from "../lib/shared-probe.ts";\nimport { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({ id: "trio-a", family: "trio", create: () => ({ evaluate: () => readShared(1) }) });\n',
  "tooling/src/verify/gates/trio-b.ts":
    'import { readShared } from "../lib/shared-probe.ts";\nimport { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({ id: "trio-b", family: "trio", create: () => ({ evaluate: () => readShared(1) }) });\n',
});

test("policy-family-readers: the REPORTED position suppresses, a DEAD position ALARMS (§4.2 discrimination)", () => {
  const drive = (marker: string): ReturnType<typeof runPolicyPass> =>
    runPolicyPass({
      knownPolicies: FAMILY,
      policies: [policyFamilyReaders],
      root: ROOT,
      project: projectOf(FAMILY_READERS_PROBE(marker)),
      reviewedGrants: [],
      failOnWarnings: false,
    });

  const correct = drive("// @orb-waive policy-family-readers(family): the planted probe defers its shared reader; ends when the reader lands in lib/.");
  expect(correct.authority.effectiveFindings).toEqual([]);
  expect(correct.authority.waivedFindings).toHaveLength(1);
  expect(correct.authority.authorityAlarms).toEqual([]);

  const dead = drive("// @orb-waive policy-family-readers(nosuchposition): names a position the policy never reports.");
  expect(dead.authority.authorityAlarms).toHaveLength(1);
  expect(dead.authority.waivedFindings).toEqual([]);
  expect(dead.authority.effectiveFindings).toHaveLength(1);
});

test("policy-waiver-identity REFUSES a corpus in which it recognises no final module (the zero-count receipt)", () => {
  const legacyOnly = passOf(policyWaiverIdentity, {
    "tooling/src/verify/gates/legacy.ts": 'export const gate = { name: "legacy", docRow: "x", message: "m", mustFlag: [1], mustPass: [1] };\n',
  });
  expect(legacyOnly.toolErrors).toMatchObject([{ policyId: "policy-waiver-identity", phase: "receipt" }]);
  expect(legacyOnly.authority.withheldPolicyIds).toEqual(["policy-waiver-identity"]);
  expect(legacyOnly.authority.effectiveFindings).toEqual([]);
});

/** Keep the binding-resolution detector live after production finishes migrating its last violation. The
 *  control joins the real typed project, so it exercises the same contract identity, population resolver and
 *  ts-morph declarations as the live-corpus pass instead of a parallel fixture universe. */
async function assertLiveBindingResolution(project: Project, repoRoot: string, populationCount: number): Promise<void> {
  const { final: knownPolicies } = await loadMixedGateCorpus(repoRoot);
  const path = `${GATES_DIR}dangling-refs.ts`;
  const subject = project.getSourceFileOrThrow(`${repoRoot}/${path}`);
  const original = subject.getFullText();
  const drive = (expected: readonly { readonly token: string }[]): void => {
    const result = runPolicyPass({
      knownPolicies,
      policies: [policyBindingResolution],
      root: repoRoot,
      project,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.factErrors).toEqual([]);
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.toolErrors).toEqual([]);
    expect(result.authority.authorityAlarms).toEqual([]);
    expect(result.authority.withheldPolicyIds).toEqual([]);
    expect(result.authority.waivedFindings).toEqual([]);
    expect(result.authority.grantedFindings).toEqual([]);
    const owner = result.policies.find(({ id }) => id === policyBindingResolution.id);
    expect(owner?.owner).toEqual({ status: "success", population: "complete" });
    expect(owner?.receipts).toEqual([]);
    expect(owner?.population.requestedPaths).toBeNull();
    expect(owner?.population.effectiveSourcePaths).toHaveLength(populationCount);
    expect(owner?.population.effectiveSourcePaths).toContain(path);
    expect(result.authority.effectiveFindings.filter(({ file }) => file === path).map(({ token }) => ({ token }))).toEqual(expected);
  };
  try {
    subject.addImportDeclaration({ namedImports: ["defineGate"], moduleSpecifier: "../contract/policy.ts" });
    const registration = subject.getVariableDeclarationOrThrow("gate");
    registration.setInitializer(`defineGate(${registration.getInitializerOrThrow().getText()})`);
    drive([{ token: "getDefinitionNodes" }]);
    subject.addImportDeclaration({ namedImports: ["resolveStableExpression"], moduleSpecifier: "../lib/reference-fact.ts" });
    const localWalk = subject.getDescendantsOfKind(SyntaxKind.CallExpression).find((call) => {
      const callee = call.getExpression();
      return Node.isPropertyAccessExpression(callee) && callee.getName() === "getDefinitionNodes";
    });
    if (localWalk === undefined) {
      throw new Error("binding-resolution control lost its local getDefinitionNodes call");
    }
    localWalk.replaceWithText("resolveStableExpression(n)");
    drive([]);
  } finally {
    subject.replaceWithText(original);
  }
}

/** Exercise the production root boundary on the live project's real contract and module resolver.
 *  These sources exist only in the ts-morph project and are removed in finally; no checkout file is written.
 *  The two expected finding paths are authored controls, not a second graph or a current-policy roster. */
async function assertLiveFamilyConsumption(project: Project, repoRoot: string, shapeCount: number): Promise<void> {
  const { final: knownPolicies } = await loadMixedGateCorpus(repoRoot);
  const stem = "q08-family-consumption-control";
  const first = `${GATES_DIR}${stem}-a.ts`;
  const second = `${GATES_DIR}${stem}-b.ts`;
  const helper = `tooling/src/verify/lib/${stem}.ts`;
  const moduleSource = (id: string, production: boolean): string =>
    `import { defineGate } from "../contract/policy.ts";\nimport { readShared } from "../lib/${stem}.ts";\n` +
    `const proof = readShared(1);\nexport const gate = defineGate({ id: "${id}", family: "${stem}", mustFlag: [proof], create: () => ({ evaluate: () => ${production ? "readShared(1)" : "1"} }) });\n`;
  const planted: SourceFile[] = [];
  const drive = (expected: readonly string[]): void => {
    const result = runPolicyPass({
      knownPolicies,
      policies: [policyFamilyReaders],
      root: repoRoot,
      project,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.toolErrors).toEqual([]);
    expect(result.authority.authorityAlarms).toEqual([]);
    expect(result.authority.withheldPolicyIds).toEqual([]);
    const owner = result.policies.find(({ id }) => id === policyFamilyReaders.id);
    expect(owner?.owner).toEqual({ status: "success", population: "complete" });
    expect(owner?.receipts).toEqual([{ kind: "population", source: "final policy modules", members: shapeCount + 2, unresolved: 0 }]);
    expect(
      result.authority.effectiveFindings
        .filter(({ file }) => file === first || file === second)
        .map(({ file }) => file)
        .toSorted(),
    ).toEqual(expected);
  };
  try {
    for (const [path, source] of Object.entries({
      [helper]: "export function readShared(value: number): number { return value; }\n",
      [first]: moduleSource(`${stem}-a`, true),
      [second]: moduleSource(`${stem}-b`, false),
    })) {
      const absolute = `${repoRoot}/${path}`;
      expect(project.getSourceFile(absolute)).toBeUndefined();
      planted.push(project.createSourceFile(absolute, source));
    }
    drive([first, second]);
    project.getSourceFileOrThrow(`${repoRoot}/${second}`).replaceWithText(moduleSource(`${stem}-b`, true));
    drive([]);
  } finally {
    for (const source of planted) {
      project.removeSourceFile(source);
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// THE REAL CORPUS. Conformance runs on virtual projects with no real layout; a meta-policy over the gate
// corpus can be green there and blind here. The recognizer's live count is compared against the guide's own
// shape test, and the ERROR policy's three closed classes are asserted at zero on the tree they pin.
// ---------------------------------------------------------------------------------------------------
test(
  "the family reads the REAL gate corpus: no tool errors, nothing withheld, the recognized final count matches the shape test, and the closed classes are at zero",
  async ({ repoRoot }) => {
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
    const bindingOwner = result.policies.find(({ id }) => id === policyBindingResolution.id);
    if (bindingOwner === undefined) {
      throw new Error("policy-binding-resolution produced no owner result");
    }
    expect(bindingOwner.population.requestedPaths).toBeNull();
    expect(bindingOwner.population.effectiveSourcePaths).toEqual(bindingOwner.population.declaredSourcePaths);
    await assertLiveBindingResolution(project, repoRoot, bindingOwner.population.effectiveSourcePaths.length);
    // And the family's own modules are CLEAN under the resolution arm: the enforcer never reds its host (#2097 —
    // `policy-soundness`'s three former chains read through the shared readers now).
    expect(resolutionAccused.filter((path) => FAMILY.some((policy) => path === `${GATES_DIR}${policy.id}.ts`))).toEqual([]);

    // ── EVERY MEMBER IS ACCOUNTED FOR (#2208's actual lesson) ──────────────────────────────────────────
    //
    // This arm passed 12/12 while TWO live defects sat in the family, because it asserted on four members and
    // said nothing about the rest: an instrument that measures the thing you changed but not the surface you
    // changed it on. The completeness check below is what stops that recurring — a member in NEITHER list
    // fails here, so a new policy cannot join the family without someone deciding what its live tree says.
    //
    // OPEN = a class with live findings and a SECOND OPINION above (never a hardcoded count, #1969).
    // CLOSED = the tree itself is the proof the class is at zero.
    const openWithOpinion: ReadonlySet<string> = new Set([
      policyLegacyImports.id,
      policyBindingResolution.id,
      policyRefusalCoverage.id,
      policyFamilyReaders.id,
    ]);
    const closedAtZero: ReadonlySet<string> = new Set([
      policySoundness.id,
      policyFixtureSubstrate.id,
      policyProofExpectations.id,
      policyWaiverIdentity.id,
      policyWaiverSpelling.id,
    ]);
    expect(FAMILY.map(({ id }) => id).filter((id) => !(openWithOpinion.has(id) || closedAtZero.has(id)))).toEqual([]);
    for (const id of closedAtZero) {
      expect({ id, accused: accusedBy(id) }).toEqual({ id, accused: [] });
    }

    // `policy-refusal-coverage`'s SECOND OPINION (#2184), REWRITTEN AT #2274 — and the rewrite is the lesson.
    // The arm used to read "every module whose text owes a pin must be accused", with a comment explaining that
    // the reverse containment could not be asserted because "the pin half lives in a family test's
    // `runPolicyPass` call, which no text predicate over the gate corpus can see". That arm was green for the
    // wrong reason: the recognizer's test half was DEAD (it wanted a positional dispatcher that never existed),
    // so NOTHING was ever discharged and one-sided containment held trivially. Repairing the reader discharged
    // 43 modules and this arm went red — correctly. The fix is not to weaken it but to compute the OTHER half
    // the same way: as TEXT over the family-test tree, which this project already loads.
    // #2342: the independent dependency denominator is now the runtime loader's actual arrays, not
    // another literal-only source census that shares the defect under review. Paths come from its roster.
    const corpus = await loadMixedGateCorpus(repoRoot);
    const owingRefusal = new Set(
      corpus.final.filter((policy) => (policy.facts.length > 0 || policy.resources.length > 0) && (policy.mustRefuse?.length ?? 0) === 0).map(({ id }) => id),
    );
    const refusalOpinion = corpus.roster
      .filter((entry) => entry.contract === "final" && entry.id !== null && owingRefusal.has(entry.id))
      .map(({ path }) => path)
      .toSorted();
    const refusalAccused = new Set(accusedBy(policyRefusalCoverage.id));
    // A family test that mentions the dispatcher AND imports gate modules pins the ones it imports. Where it
    // imports EXACTLY ONE the attribution is exact, which is the half with real bite: such a module MUST be
    // discharged, or the recognizer has gone blind again in a way one-sided containment would never show.
    const pinnedByText = new Set<string>();
    const pinnedUnambiguously = new Set<string>();
    for (const sourceFile of project.getSourceFiles()) {
      const text = sourceFile.getFullText();
      if (!(sourceFile.getFilePath().startsWith(`${repoRoot}/${FAMILY_TESTS_DIR}`) && text.includes(`${DISPATCHER_NAME}(`))) {
        continue;
      }
      const imported = [...new Set([...text.matchAll(GATE_MODULE_IMPORT_RE)].flatMap(([, id]) => (id === undefined ? [] : [id])))];
      for (const id of imported) {
        pinnedByText.add(id);
      }
      const only = imported.length === 1 ? imported[0] : undefined;
      if (only !== undefined) {
        pinnedUnambiguously.add(only);
      }
    }
    const idOf = (path: string): string => path.slice(GATES_DIR.length, -".ts".length);
    // NOT BLIND: a module that owes a pin and has no family test naming it at all must be accused.
    expect(refusalOpinion.filter((path) => !(refusalAccused.has(path) || pinnedByText.has(idOf(path))))).toEqual([]);
    // NOT DEAD: a module whose ONLY family test drives it and nothing else must be discharged. This is the
    // assertion #2274 would have failed for a week, and the reason the arm is now two-sided.
    expect(refusalOpinion.filter((path) => pinnedUnambiguously.has(idOf(path)) && refusalAccused.has(path))).toEqual([]);
    expect(refusalOpinion.length).toBeGreaterThan(0);
    expect(pinnedUnambiguously.size).toBeGreaterThan(0);

    // Import-only equality stopped being an oracle when production consumption became the contract.
    // The live corpus moved from eleven to twelve findings because the autosave health member uses its
    // shared subject only in proofs. Those counts are a measured delta, never a maintained expectation.
    // Paired controls below exercise the actual live project and keep their expected verdict independent
    // of the dependency reader: a proof-only common import flags, then a production call acquits.
    await assertLiveFamilyConsumption(project, repoRoot, shapeCount);

    // The error policy pins its CLOSED classes; the tree is the proof they are closed. Asserted LAST so a red here
    // (a foreign module landing an unwrapped read, as `97e68be91` did for E4) still lets every receipt above print.
    expect(result.authority.effectiveFindings.filter(({ policyId }) => policyId === policySoundness.id)).toEqual([]);
  },
  REAL_CORPUS_TIMEOUT_MS,
);
