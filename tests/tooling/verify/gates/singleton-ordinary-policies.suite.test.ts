// Positional waiver identity for ordinary singleton policies, through the production policy runtime.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as busOnDataNoStoreWrite } from "../../../../tooling/src/verify/gates/bus-on-data-no-store-write.ts";
import { gate as membershipFanGuard } from "../../../../tooling/src/verify/gates/membership-fan-guard.ts";
import { gate as testFactoryContract } from "../../../../tooling/src/verify/gates/test-factory-contract.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const ROOT = "/singleton-ordinary-policies";

const FAMILY: readonly GatePolicy[] = [busOnDataNoStoreWrite, membershipFanGuard, testFactoryContract];

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

test("the singleton-family ordinary policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// THE FIXTURE-SPECIFIER RESOLUTION CONTROL (§4.8). A proof row's relative import that resolves to NOTHING
// makes every identity row pass by FAIL-CLOSURE while conformance still reports green.
// ---------------------------------------------------------------------------------------------------
function danglingSpecifiers(files: readonly SourceFile[]): readonly string[] {
  return files
    .flatMap((sourceFile) => sourceFile.getImportDeclarations())
    .filter((declaration) => declaration.getModuleSpecifierValue().startsWith(".") && declaration.getModuleSpecifierSourceFile() === undefined)
    .map((declaration) => `${declaration.getSourceFile().getFilePath()} -> ${declaration.getModuleSpecifierValue()}`);
}

test("every relative import in every proof resolves inside the proof's own file map", () => {
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
// ORDINARY MARKER IDENTITY (§4.2), one positive arm per policy: the correct `@orb-waive <id>(<position>)`
// at the position the policy reports suppresses its ONE finding, consumes exactly one waiver, and raises no
// authority alarm. Every fixture produces exactly one finding, because one marker consumes one occurrence.
// The assertions are written out in each test rather than behind a shared helper — a helper hides them from
// the `useExpect` lint, and an arm that silently asserts nothing is precisely the defect class this file
// exists to close.
//
// The position each policy reports is NOT uniformly "the thing the message names", which is why each needs
// its own arm:
//   bus-on-data-no-store-write      the bare `setState` identifier — the marker grammar forbids parens
//   membership-fan-guard            each banned identifier OCCURRENCE
//   test-factory-contract           the FACTORY'S OWN NAME, not the `db` parameter the message names
// ---------------------------------------------------------------------------------------------------
const REASON = "the proof's stand-in reason; ends when this fixture stops flagging.";

test("bus-on-data-no-store-write: a waiver naming the bare setState identifier binds to its own finding", () => {
  const waived = passOf(busOnDataNoStoreWrite, {
    "packages/client/src/data/bus/waived.ts": `export const sub = {\n  onData: () => {\n    // @orb-waive bus-on-data-no-store-write(setState): ${REASON}\n    useX.setState({ a: 1 });\n  },\n};\n`,
  });

  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("membership-fan-guard: a waiver naming the banned identifier binds to its single occurrence", () => {
  const waived = passOf(membershipFanGuard, {
    "packages/server/src/domain/chat/verbs/waived.ts": `// @orb-waive membership-fan-guard(emitUserEvent): ${REASON}\nexport const forward = emitUserEvent;\n`,
  });

  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("test-factory-contract: a waiver naming the FACTORY, not its db parameter, binds to its finding", () => {
  const waived = passOf(testFactoryContract, {
    "tests/support/node/factories/waived.ts": `// @orb-waive test-factory-contract(makeUser): ${REASON}\nexport function makeUser(db: unknown) {\n  return db;\n}\n`,
  });

  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// AND THE ARMS DISCRIMINATE. Written once over the whole set rather than six times: for each policy, the
// SAME fixture with the marker's position replaced by a name the carrier does not declare must leave the
// finding EFFECTIVE and raise an alarm naming that policy. Without this, every arm above would be equally
// green against a policy that reported an unspellable position and a waiver engine that silently matched
// nothing — the #1954 `.setState(` defect, which shut `bus-on-data-no-store-write`'s door completely while
// every one of its proof rows stayed green.
// ---------------------------------------------------------------------------------------------------
const DEAD = "names a position this carrier does not declare.";

test("a waiver naming a DEAD position suppresses nothing and alarms, for every policy", () => {
  const arms: readonly (readonly [GatePolicy, Readonly<Record<string, string>>])[] = [
    [
      busOnDataNoStoreWrite,
      {
        "packages/client/src/data/bus/dead.ts": `export const sub = {\n  onData: () => {\n    // @orb-waive bus-on-data-no-store-write(setStateX): ${DEAD}\n    useX.setState({ a: 1 });\n  },\n};\n`,
      },
    ],
    [
      membershipFanGuard,
      {
        "packages/server/src/domain/chat/verbs/dead.ts": `// @orb-waive membership-fan-guard(emitChatChanged): ${DEAD}\nexport const forward = emitUserEvent;\n`,
      },
    ],
    [
      testFactoryContract,
      {
        "tests/support/node/factories/dead.ts": `// @orb-waive test-factory-contract(db): ${DEAD}\nexport function makeUser(db: unknown) {\n  return db;\n}\n`,
      },
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
  // The sweep covers the WHOLE family, never a subset that silently shrank.
  expect(arms).toHaveLength(FAMILY.length);
});
