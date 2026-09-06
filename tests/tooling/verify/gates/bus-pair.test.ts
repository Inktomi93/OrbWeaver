// Conformance entry for the bus PAIR: the two legacy modules that stayed behind when the four producer
// coverage policies converted. Every proof runs through the production dispatcher, and the arms a proof
// row cannot express — a REFUSAL, and the retirement of a whole exemption table — are pinned through
// `runPolicyPass` here.
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as busBeltTotal } from "../../../../tooling/src/verify/gates/bus-belt-total.ts";
import { gate as busConsumerBelt } from "../../../../tooling/src/verify/gates/bus-consumer-belt.ts";
import { gate as busCoverageOwner } from "../../../../tooling/src/verify/gates/bus-coverage-owner.ts";
import { gate as busDefinitionBelts } from "../../../../tooling/src/verify/gates/bus-definition-belts.ts";
import { gate as userBusCoverage } from "../../../../tooling/src/verify/gates/user-bus-coverage.ts";
import { gate as userBusDeferredMember } from "../../../../tooling/src/verify/gates/user-bus-deferred-member.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/bus-pair";
// EVERY per-row loop in this file says its own budget. The default (`BASE_TEST_TIMEOUT_MS`, 5 s scaled by
// contention) is a per-TEST number, and these tests concentrate the whole family's proof set into ONE
// test: growth in the proof set walks them into a timeout that reads exactly like an assertion failure.
// It already happened — `bus-coverage-owner` grew to seven rows and the fixture-resolution control went
// from 1.8 s to 12.4 s in a batch. `scaledBudget` is the house spelling (it grows with box load too).
const CONFORMANCE_TIMEOUT_MS = scaledBudget(240_000);
const PER_ROW_TIMEOUT_MS = scaledBudget(60_000);
const PAIR = [busBeltTotal, busConsumerBelt, busCoverageOwner, busDefinitionBelts, userBusCoverage, userBusDeferredMember];

const USER_UNION_ONLY_DEFERRED =
  'export type UserBusEvent = { type: "connectionsChanged" };\nexport const USER_BUS_EVENT_TYPES = { connectionsChanged: true } satisfies Record<UserBusEvent["type"], true>;\n';

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

test(
  "the bus pair keeps its founding, near-legal and split fixtures",
  () => {
    expect(verifyPolicyProofs(PAIR)).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);

/** Relative specifiers that reach nothing, over an EXACT set of files. Deliberately scoped to the files
 *  of one proof row: a specifier answered by a neighbouring row's file is the false green this control
 *  exists to refuse, so the rows are never merged into one project. */
function danglingSpecifiers(files: readonly SourceFile[]): readonly string[] {
  return files
    .flatMap((sourceFile) => sourceFile.getImportDeclarations())
    .filter((declaration) => declaration.getModuleSpecifierValue().startsWith(".") && declaration.getModuleSpecifierSourceFile() === undefined)
    .map((declaration) => `${declaration.getSourceFile().getFilePath()} -> ${declaration.getModuleSpecifierValue()}`);
}

test(
  "every proof fixture's relative import resolves inside the virtual project",
  () => {
    // ONE project for the whole sweep, emptied between rows — the conformance runtime's own shape. A fresh
    // `Project` per row pays a new in-memory host and program for each of the family's proof rows, which
    // is what walked this control into the default budget as the proof set grew. Isolation is kept by a
    // UNIQUE ROOT per row plus the removal below, not by a fresh workspace.
    const shared = new Project({ useInMemoryFileSystem: true });
    const dangling: string[] = [];
    let sequence = 0;
    for (const policy of PAIR) {
      for (const proof of [...policy.mustFlag, ...policy.mustPass]) {
        sequence += 1;
        const root = `${ROOT}-proof-${sequence}`;
        const files = Object.entries(proof.files).map(([path, source]) => shared.createSourceFile(`${root}/${path}`, source));
        dangling.push(...danglingSpecifiers(files).map((row) => `${policy.id}: ${row}`));
        for (const file of files) {
          shared.removeSourceFile(file);
        }
      }
    }
    // A specifier that reaches nothing makes an identity row pass by fail-closure while conformance is green.
    expect(dangling).toEqual([]);
    // AND THE SWEEP ACTUALLY RAN. Emptying one project between rows buys speed at the cost of a silent
    // failure mode a fresh-project loop did not have: if the rows stopped being visited, "zero dangling"
    // would read exactly like "every specifier resolves". The count is derived from the descriptors, so it
    // cannot rot into a hand-carried number either.
    const declared = PAIR.reduce((sum, policy) => sum + policy.mustFlag.length + policy.mustPass.length, 0);
    expect(sequence).toBe(declared);
    expect(sequence).toBeGreaterThan(0);
  },
  PER_ROW_TIMEOUT_MS,
);

test("a deferral that outlives its subject REFUSES instead of passing silently", () => {
  const result = passOf(userBusDeferredMember, {
    // The deferred member was renamed. Every other identity still resolves, so a name-keyed exemption
    // would sit here forever describing nothing.
    "packages/contracts/src/user-bus/index.ts":
      'export type UserBusEvent = { type: "connectionChanged" };\nexport const USER_BUS_EVENT_TYPES = { connectionChanged: true } satisfies Record<UserBusEvent["type"], true>;\n',
  });
  expect(result.policies[0]?.owner.status).toBe("incomplete");
  expect(result.toolErrors.map(({ phase, message }) => `${phase}: ${message}`)).toEqual([
    "evaluate: deferred UserBusEvent member connectionsChanged is no longer declared — this deferral outlived its subject",
  ]);
});

test(
  "the deferred member is owned by exactly one of the two policies, in both of its states",
  () => {
    const deferredLive = { "packages/contracts/src/user-bus/index.ts": USER_UNION_ONLY_DEFERRED };
    expect(passOf(userBusCoverage, deferredLive).authority.effectiveFindings).toEqual([]);
    expect(passOf(userBusDeferredMember, deferredLive).authority.effectiveFindings).toEqual([]);

    const retired = {
      "packages/contracts/src/user-bus/index.ts": USER_UNION_ONLY_DEFERRED,
      "packages/server/src/domain/connection/verbs/save.ts":
        'import type { UserBusEvent } from "../../../../../contracts/src/user-bus/index.ts";\nexport function save(ctx: { emitUserEvent: (userId: string, event: UserBusEvent) => void }, userId: string): void {\n  ctx.emitUserEvent(userId, { type: "connectionsChanged" });\n}\n',
    };
    expect(passOf(userBusCoverage, retired).authority.effectiveFindings).toEqual([]);
    const retirement = passOf(userBusDeferredMember, retired).authority.effectiveFindings;
    expect(retirement.map(({ policyId, severity }) => `${policyId}/${severity}`)).toEqual(["user-bus-deferred-member/warning"]);
  },
  PER_ROW_TIMEOUT_MS,
);

test(
  "a definition fact that resolves no bus union REFUSES instead of reporting every bus healthy",
  () => {
    const blind = { "packages/contracts/src/probe/index.ts": "export const noBusUnion = true;\n" };
    for (const policy of [busDefinitionBelts, busBeltTotal, busConsumerBelt]) {
      const result = passOf(policy, blind);
      expect(`${policy.id}: ${result.policies[0]?.owner.status}`).toBe(`${policy.id}: incomplete`);
      expect(result.authority.effectiveFindings).toEqual([]);
    }
  },
  PER_ROW_TIMEOUT_MS,
);

test("a coverage-owner run that parsed no gate module REFUSES instead of reporting every bus unowned", () => {
  // The union and its belt are real; only the gate corpus is absent, which is "I could not look".
  const result = passOf(busCoverageOwner, {
    "packages/contracts/src/probe/index.ts":
      'export type ProbeBusEvent = { type: "a" };\nexport const PROBE_EVENT_TYPES = { a: true } satisfies Record<ProbeBusEvent["type"], true>;\n',
  });
  expect(result.policies[0]?.owner.status).toBe("incomplete");
  expect(result.authority.effectiveFindings).toEqual([]);
});

test("the retired BELT_EXEMPT rows are DERIVED, not ported: a sub-union is exempt only while it is one", () => {
  const belted =
    'export type ChatBusEvent = { type: "delta" } | { type: "typing" };\nexport const CHAT_BUS_EVENT_TYPES = { delta: true, typing: true } satisfies Record<ChatBusEvent["type"], true>;\n';
  const derived = passOf(busDefinitionBelts, {
    "packages/contracts/src/chat/bus.ts": `${belted}export type DurableChatBusEvent = Exclude<ChatBusEvent, { type: "typing" }>;\n`,
  });
  expect(derived.authority.effectiveFindings).toEqual([]);

  // The SAME NAME, no longer a subset: the row that used to license it by name would still be green.
  const grown = passOf(busDefinitionBelts, {
    "packages/contracts/src/chat/bus.ts": `${belted}export type DurableChatBusEvent = { type: "archived" };\n`,
  });
  expect(grown.authority.effectiveFindings.map(({ message }) => message?.includes("DurableChatBusEvent"))).toEqual([true]);
});
