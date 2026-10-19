// Ordinary-visitor proofs run through the production dispatcher on an isolated population; the pins
// below cover what a proof row structurally cannot express — a receipt REFUSAL (a tool error, not a
// finding), the ordinary marker identity each ordinary policy's report must supply, and the grant liveness
// the reviewed-grant policies' whole authority rests on.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as emptyStateHasAction } from "../../../../tooling/src/verify/gates/empty-state-has-action.ts";
import { gate as noInlineDomainInterface } from "../../../../tooling/src/verify/gates/no-inline-domain-interface.ts";
import { gate as noInlinePackageInterface } from "../../../../tooling/src/verify/gates/no-inline-package-interface.ts";
import { gate as noInlineTypes } from "../../../../tooling/src/verify/gates/no-inline-types.ts";
import { gate as noInlineWireInterface } from "../../../../tooling/src/verify/gates/no-inline-wire-interface.ts";
import { gate as noRawEgress } from "../../../../tooling/src/verify/gates/no-raw-egress.ts";
import { gate as persistenceBoundary } from "../../../../tooling/src/verify/gates/persistence-boundary.ts";
import { gate as registryAssemblyAtDoorOnly } from "../../../../tooling/src/verify/gates/registry-assembly-at-door-only.ts";
import { gate as zodErrorIssuesHome } from "../../../../tooling/src/verify/gates/zod-error-issues-home.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const FAMILY: readonly GatePolicy[] = [
  emptyStateHasAction,
  noInlineDomainInterface,
  noInlinePackageInterface,
  noInlineTypes,
  noInlineWireInterface,
  noRawEgress,
  persistenceBoundary,
  registryAssemblyAtDoorOnly,
  zodErrorIssuesHome,
];

// EVERY row-scaled test here says its own budget. The default is a per-TEST number and these tests
// concentrate the whole wave's proof set into ONE test, so growth in the set walks them into a timeout that
// reads exactly like an assertion failure. `scaledBudget` also grows with box load.
const CONFORMANCE_TIMEOUT_MS = scaledBudget(300_000);
const PER_ROW_TIMEOUT_MS = scaledBudget(120_000);

const ROOT = "/ordinary-visitors-family";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(
  policy: GatePolicy,
  files: Readonly<Record<string, string>>,
  grants: Parameters<typeof runPolicyPass>[0]["reviewedGrants"] = [],
): ReturnType<typeof runPolicyPass> {
  const project = projectOf(files);
  return runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root: ROOT,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: grants,
    failOnWarnings: false,
  });
}

test(
  "the ordinary-visitor policies keep their founding, respelling, permission and counterfactual fixtures",
  () => {
    expect(verifyPolicyProofs(FAMILY)).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);

// ---------------------------------------------------------------------------------------------------
// THE FIXTURE-SPECIFIER RESOLUTION CONTROL. A proof row's relative import that resolves to NOTHING makes
// every identity row pass by FAIL-CLOSURE while conformance still reports green — the lying-proof shape
// earlier waves paid for. Every relative specifier in every row of this wave must reach a file in the
// row's OWN map, which is why the rows are never merged into one project.
// ---------------------------------------------------------------------------------------------------
function danglingSpecifiers(files: readonly SourceFile[]): readonly string[] {
  return files
    .flatMap((sourceFile) => sourceFile.getImportDeclarations())
    .filter((declaration) => declaration.getModuleSpecifierValue().startsWith(".") && declaration.getModuleSpecifierSourceFile() === undefined)
    .map((declaration) => `${declaration.getSourceFile().getFilePath()} -> ${declaration.getModuleSpecifierValue()}`);
}

test(
  "every relative import in every proof of this wave resolves inside the proof's own file map",
  () => {
    // ONE project for the whole sweep, emptied between rows (the conformance runtime's own shape); a fresh
    // Project per row pays a new in-memory host and program for each of the wave's rows. Isolation comes
    // from a UNIQUE ROOT per row plus the removal below, never from a fresh workspace.
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
    // AND THE SWEEP ACTUALLY RAN: emptying one project between rows buys speed at the cost of a silent
    // failure mode, because "zero dangling" and "no row was visited" look identical. The expected count is
    // DERIVED from the descriptors, so it cannot rot into a hand-carried number either.
    const declared = FAMILY.reduce((sum, policy) => sum + policyProofRows(policy).length, 0);
    expect(sequence).toBe(declared);
    expect(sequence).toBeGreaterThan(0);
  },
  PER_ROW_TIMEOUT_MS,
);

// ---------------------------------------------------------------------------------------------------
// RECEIPT REFUSALS. Policies LOCATE a subject and refuse when it is gone — the final form of the
// legacy blindness arms (`canonicalSeen === 0`) and rename tripwires, which conformance
// cannot express because a refusal is a TOOL ERROR rather than a finding.
// ---------------------------------------------------------------------------------------------------
test("registry-assembly-at-door-only REFUSES when the registry home no longer exports both factories", () => {
  const renamed = passOf(registryAssemblyAtDoorOnly, {
    "packages/client/src/lib/registry.ts":
      "export declare function createRegistry(name: string, ids: readonly string[], definitions: Record<string, unknown>): unknown;\n",
    "packages/client/src/features/x/lib/x.ts": "export const x = null;\n",
  });

  expect(renamed.toolErrors).toMatchObject([{ policyId: "registry-assembly-at-door-only", phase: "receipt" }]);
  expect(renamed.policies[0]?.receipts).toMatchObject([{ kind: "population", source: "registry factories", members: 1, unresolved: 1 }]);
});

// ---------------------------------------------------------------------------------------------------
// ORDINARY MARKER IDENTITY. Each ordinary policy's report must supply the policy id AND a position token
// that is authored text at the finding's own coordinate — otherwise the central engine cannot bind a
// marker to it, and every waiver in the tree would be a silent no-op.
// ---------------------------------------------------------------------------------------------------
test("an ordinary waiver binds to the exact policy and position this wave's reports supply", () => {
  const waived = passOf(noInlineTypes, {
    "packages/client/src/features/x/view.ts":
      "// @orb-waive no-inline-types(Foo): the proof's stand-in reason and its end condition.\ntype Foo = string;\nexport type { Foo };\n",
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("a waiver naming the WRONG position suppresses nothing and reports a dead position", () => {
  const mismatched = passOf(noInlineTypes, {
    "packages/client/src/features/x/view.ts":
      "// @orb-waive no-inline-types(Bar): names a type this carrier does not declare.\ntype Foo = string;\nexport type { Foo };\n",
  });

  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: "no-inline-types" }]);
});

test("empty-state-has-action reports the AUTHORED tag as its position, so an aliased render is waivable", () => {
  const waived = passOf(emptyStateHasAction, {
    "packages/ui/src/primitives/empty-state/empty-state.tsx": "export declare function EmptyState(props: { title: string; action?: unknown }): unknown;\n",
    "packages/client/src/features/demo/alias.tsx":
      'import { EmptyState as Empty } from "../../../../ui/src/primitives/empty-state/empty-state.tsx";\n' +
      "// @orb-waive empty-state-has-action(Empty): the proof's stand-in reason and its end condition.\n" +
      'export const G = (): unknown => <Empty title="Nothing here" />;\n',
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
});

// ---------------------------------------------------------------------------------------------------
// GRANT LIVENESS. A reviewed-grant policy's authority IS the central table, so the verdicts that make a row
// honest are pinned on real policies rather than assumed.
// ---------------------------------------------------------------------------------------------------
test("a raw-storage grant is keyed on the STORE as well as the file, so one licence is not two", () => {
  const files = {
    "packages/client/src/state/durable-local.ts":
      'export const read = (): string | null => globalThis.localStorage.getItem("k");\nexport const tab = (): string | null => globalThis.sessionStorage.getItem("k");\n',
  };
  const local = {
    id: "persistence-boundary:proof",
    policyId: "persistence-boundary",
    subject: "packages/client/src/state/durable-local.ts",
    operation: "raw-storage:localStorage",
    why: "the proof's stand-in for a real boot-machinery row",
    endsWhen: "the pin stops reading raw storage",
  };

  const granted = passOf(persistenceBoundary, files, [local]);

  // The localStorage read is licensed; the sessionStorage read in the SAME file is a separate operation and
  // stays effective. A file-keyed row would have licensed both, which is the over-grant the operation key
  // exists to prevent.
  expect(granted.authority.reviewedGrantConsumption).toEqual([{ id: local.id, count: 1 }]);
  expect(granted.authority.effectiveFindings.map(({ operation }) => operation)).toEqual(["raw-storage:sessionStorage"]);
});
