// Bounded verdict, authority, import and refusal controls for serialized callbacks.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as auditClientTests } from "../../../../tooling/src/verify/gates/audit-client-tests.ts";
import { gate as diagnosticLegibility } from "../../../../tooling/src/verify/gates/diagnostic-legibility.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const ROOT = "/callback-provenance-family";

const FAMILY: readonly GatePolicy[] = [diagnosticLegibility, auditClientTests];

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = projectOf(files);
  return runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root: ROOT,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("the callback policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// THE FIXTURE-SPECIFIER RESOLUTION CONTROL (§6.5). A proof row that imports across modules would pass by
// fail-closure on a dangling specifier — the resolver returns no symbol and the row's finding would have to
// come from somewhere else entirely.
// ---------------------------------------------------------------------------------------------------
function danglingSpecifiers(files: readonly SourceFile[]): readonly string[] {
  return files
    .flatMap((sourceFile) => sourceFile.getImportDeclarations())
    .filter((declaration) => declaration.getModuleSpecifierValue().startsWith(".") && declaration.getModuleSpecifierSourceFile() === undefined)
    .map((declaration) => `${declaration.getSourceFile().getFilePath()} -> ${declaration.getModuleSpecifierValue()}`);
}

test("every relative import in every declared proof resolves inside the proof's own file map", () => {
  const shared = new Project({ useInMemoryFileSystem: true });
  const dangling: string[] = [];
  let sequence = 0;
  for (const policy of FAMILY) {
    for (const { proof } of policyProofRows(policy)) {
      sequence += 1;
      const root = `${ROOT}-proof-${sequence}`;
      const files = Object.entries(proof.files).map(([path, source]) => shared.createSourceFile(`${root}/${path}`, source));
      dangling.push(...danglingSpecifiers(files).map((row) => `${policy.id}: ${row}`));
      for (const file of files) {
        shared.removeSourceFile(file);
      }
    }
  }
  expect(dangling).toEqual([]);
  // AND THE SWEEP ACTUALLY RAN: "zero dangling" and "no row was visited" look identical, so the expected
  // count is DERIVED from the descriptors rather than hand-carried.
  const declared = FAMILY.reduce((sum, policy) => sum + policyProofRows(policy).length, 0);
  expect(sequence).toBe(declared);
  expect(sequence).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------------------------------
// ORDINARY MARKER IDENTITY (§6.2), one POSITIVE arm per ordinary policy: the correct
// `@orb-waive <id>(<position>)` at the position the policy reports suppresses its ONE finding, consumes
// exactly one waiver and raises no authority alarm. Assertions are explicit rather than hidden behind a helper —
// a helper hides them from the `useExpect` lint, and an arm that silently asserts nothing is exactly the
// defect class this file exists to close.
//
// THESE POLICIES SHIPPED `authority: "ordinary"` WITH NO WORKING DOOR (§3, "ordinary is a claim about the
// door"): a synthetic token at `offset: 0` is not authored text, so `locateFinding` could never bind a waiver
// to it. These arms are the first proof that each policy has a usable door at all.
// ---------------------------------------------------------------------------------------------------
const REASON = "the proof's stand-in reason; ends when this fixture stops flagging.";

test("diagnostic-legibility: a waiver naming the PROPERTY NAME binds to its own finding", () => {
  const waived = passOf(diagnosticLegibility, {
    "tooling/src/verify/gates/waived.ts": `// @orb-waive diagnostic-legibility(message): ${REASON}\nexport const gate = { message: "a bare diagnostic with no home" };\n`,
  });

  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("audit-client-tests: a waiver naming the TEST CALLEE binds to its own finding", () => {
  const waived = passOf(auditClientTests, {
    "tests/tooling/waived.test.ts": `// @orb-waive audit-client-tests(test): ${REASON}\ntest("does nothing", () => {\n  const x = 1;\n  void x;\n});\n`,
  });

  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// AND THE ARMS DISCRIMINATE. For each ordinary policy, the SAME fixture with the marker's position
// replaced by a name the carrier does not declare must leave the finding EFFECTIVE and raise an alarm
// naming that policy. Without this, every arm above would be equally green against a policy that reported
// an unspellable position and a waiver engine that silently matched nothing — which is precisely what these
// policies did before the conversion.
// ---------------------------------------------------------------------------------------------------
const DEAD = "names a position this carrier does not declare.";

test("a waiver naming a DEAD position suppresses nothing and alarms, for every ordinary policy", () => {
  const arms: readonly (readonly [GatePolicy, Readonly<Record<string, string>>])[] = [
    [
      diagnosticLegibility,
      {
        "tooling/src/verify/gates/dead.ts": `// @orb-waive diagnostic-legibility(fix): ${DEAD}\nexport const gate = { message: "a bare diagnostic with no home" };\n`,
      },
    ],
    [
      auditClientTests,
      { "tests/tooling/dead.test.ts": `// @orb-waive audit-client-tests(describe): ${DEAD}\ntest("does nothing", () => {\n  const x = 1;\n  void x;\n});\n` },
    ],
  ];

  const unbound = arms
    .map(([policy, files]) => {
      const result = passOf(policy, files);
      const alarmed = result.authority.authorityAlarms.some((alarm) => alarm.policyId === policy.id);
      return result.authority.effectiveFindings.length === 1 && alarmed ? null : policy.id;
    })
    .filter((id) => id !== null);

  expect(unbound).toEqual([]);
  // The sweep covers every ORDINARY member, never a subset that silently shrank.
  expect(arms).toHaveLength(FAMILY.filter((policy) => policy.authority === "ordinary").length);
});

// ---------------------------------------------------------------------------------------------------
// REFUSAL ENVELOPE CONTROLS (§6.3). These assertions pin policy identity, evaluation phase, and
// diagnostic text through runPolicyPass. A declared mustRefuse row owns the refusal verdict; these
// controls additionally inspect the production error shape.
// ---------------------------------------------------------------------------------------------------
// THE MEASUREMENT THAT RETIRED AN ARM, kept as a pin so the next reader inherits the fact rather than the
// assumption. `audit-client-tests` shipped a draft out-of-population REFUSAL for a helper whose body lives
// outside the policy's population. Running it showed the branch UNREACHABLE: an imported identifier's
// symbol declared an `ImportSpecifier`, which has no body, so `resolveCalleeBody` never left the calling
// file — in the final policy AND in the legacy gate, neither of which called `getAliasedSymbol`.
//
// THE MECHANISM CHANGED AND THE VERDICT DID NOT (#2163, the shared-reader migration). `resolveCalleeBody`
// now asks `floor/code-facts/reference-fact-call.ts#resolveCallableDeclaration`, which DOES follow the import to
// `outside.ts` and returns its body; the policy declines it at an explicit source-file FENCE, because a
// cross-file body would make a `selected-files` verdict depend on a file the request need not contain.
// So the same one finding is asserted here for a different reason, and the fence — unlike the reader
// weakness it replaced — is falsifiable: the policy's own `mustFlag[8]` reds when it is cut.
test("audit-client-tests: an IMPORTED assertion helper is not followed — the declared limit, now a FENCE", () => {
  const result = passOf(auditClientTests, {
    "tests/support/outside.ts": "export function expectOk(x: number): void {\n  expect(x).toBeGreaterThan(0);\n}\n",
    "tests/tooling/helper-outside.test.ts": 'import { expectOk } from "../support/outside.ts";\ntest("asserts elsewhere", () => {\n  expectOk(1);\n});\n',
  });

  // No refusal, and no silence either: the policy renders its ordinary verdict, which is that this test
  // carries no assertion it is willing to look at. A future widening (dropping the fence) turns this
  // green and owes a successor proof.
  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.findings).toHaveLength(1);
  expect(result.policies[0]?.findings[0]?.token).toBe("test");
});
