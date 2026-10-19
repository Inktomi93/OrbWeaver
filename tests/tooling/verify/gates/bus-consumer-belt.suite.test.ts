// Conformance entry for `bus-consumer-belt`. Every proof runs through the production dispatcher, and the arm a
// proof row cannot express — a REFUSAL when the definition fact resolves no bus union — is pinned through
// `runPolicyPass` here.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as busConsumerBelt } from "../../../../tooling/src/verify/gates/bus-consumer-belt.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/bus-consumer-belt";
// EVERY per-row loop in this file says its own budget. The default (`BASE_TEST_TIMEOUT_MS`, 5 s scaled by
// contention) is a per-TEST number, and these tests concentrate the whole proof set into ONE test: growth in
// the proof set walks them into a timeout that reads exactly like an assertion failure. `scaledBudget` is the
// house spelling (it grows with box load too).
const CONFORMANCE_TIMEOUT_MS = scaledBudget(240_000);
const PER_ROW_TIMEOUT_MS = scaledBudget(60_000);

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
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

test(
  "bus-consumer-belt keeps its founding, near-legal and split fixtures",
  () => {
    expect(verifyPolicyProofs([busConsumerBelt])).toEqual([]);
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
    // `Project` per row pays a new in-memory host and program for each of the proof rows, which is what walked
    // this control into the default budget as the proof set grew. Isolation is kept by a UNIQUE ROOT per row
    // plus the removal below, not by a fresh workspace.
    const shared = new Project({ useInMemoryFileSystem: true });
    const dangling: string[] = [];
    let sequence = 0;
    for (const { proof } of policyProofRows(busConsumerBelt)) {
      sequence += 1;
      const root = `${ROOT}-proof-${sequence}`;
      const files = Object.entries(proof.files).map(([path, source]) => shared.createSourceFile(`${root}/${path}`, source));
      dangling.push(...danglingSpecifiers(files).map((row) => `${busConsumerBelt.id}: ${row}`));
      for (const file of files) {
        shared.removeSourceFile(file);
      }
    }
    // A specifier that reaches nothing makes an identity row pass by fail-closure while conformance is green.
    expect(dangling).toEqual([]);
    // AND THE SWEEP ACTUALLY RAN. Emptying one project between rows buys speed at the cost of a silent
    // failure mode a fresh-project loop did not have: if the rows stopped being visited, "zero dangling"
    // would read exactly like "every specifier resolves". The count is derived from the descriptor, so it
    // cannot rot into a hand-carried number either.
    expect(sequence).toBe(policyProofRows(busConsumerBelt).length);
    expect(sequence).toBeGreaterThan(0);
  },
  PER_ROW_TIMEOUT_MS,
);

test(
  "a definition fact that resolves no bus union REFUSES instead of reporting every bus healthy",
  () => {
    const blind = { "packages/contracts/src/probe/index.ts": "export const noBusUnion = true;\n" };
    const result = passOf(busConsumerBelt, blind);
    expect(`${busConsumerBelt.id}: ${result.policies[0]?.owner.status}`).toBe(`${busConsumerBelt.id}: incomplete`);
    expect(result.authority.effectiveFindings).toEqual([]);
  },
  PER_ROW_TIMEOUT_MS,
);
