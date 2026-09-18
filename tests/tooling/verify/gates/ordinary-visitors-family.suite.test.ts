// Conformance entry for the ORDINARY-VISITOR wave: ten legacy simple-visitor gates converted into fifteen
// final policies. Every proof runs through the production dispatcher on an isolated population; the pins
// below cover what a proof row structurally cannot express — a receipt REFUSAL (a tool error, not a
// finding), the ordinary marker identity each ordinary policy's report must supply, and the grant liveness
// the five reviewed-grant policies' whole authority rests on.
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as emptyStateHasAction } from "../../../../tooling/src/verify/gates/empty-state-has-action.ts";
import { gate as noInlineDomainInterface } from "../../../../tooling/src/verify/gates/no-inline-domain-interface.ts";
import { gate as noInlineTypes } from "../../../../tooling/src/verify/gates/no-inline-types.ts";
import { gate as noMutatingRegisterApi } from "../../../../tooling/src/verify/gates/no-mutating-register-api.ts";
import { gate as noRawEgress } from "../../../../tooling/src/verify/gates/no-raw-egress.ts";
import { gate as noRawInteractiveIntrinsics } from "../../../../tooling/src/verify/gates/no-raw-interactive-intrinsics.ts";
import { gate as noRejectedCorsProxy } from "../../../../tooling/src/verify/gates/no-rejected-cors-proxy.ts";
import { gate as noUntypedSoftRef } from "../../../../tooling/src/verify/gates/no-untyped-soft-ref.ts";
import { gate as persistedStoreRegistry } from "../../../../tooling/src/verify/gates/persisted-store-registry.ts";
import { gate as persistenceBoundary } from "../../../../tooling/src/verify/gates/persistence-boundary.ts";
import { gate as pluginDumpGuard } from "../../../../tooling/src/verify/gates/plugin-dump-guard.ts";
import { gate as registryAssemblyAtDoorOnly } from "../../../../tooling/src/verify/gates/registry-assembly-at-door-only.ts";
import { gate as untrustedRegexSafeExec } from "../../../../tooling/src/verify/gates/untrusted-regex-safe-exec.ts";
import { gate as zodErrorIssuesHome } from "../../../../tooling/src/verify/gates/zod-error-issues-home.ts";
import { gate as zodModernSpellings } from "../../../../tooling/src/verify/gates/zod-modern-spellings.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const FAMILY: readonly GatePolicy[] = [
  emptyStateHasAction,
  noInlineDomainInterface,
  noInlineTypes,
  noMutatingRegisterApi,
  noRawEgress,
  noRawInteractiveIntrinsics,
  noRejectedCorsProxy,
  noUntypedSoftRef,
  persistedStoreRegistry,
  persistenceBoundary,
  pluginDumpGuard,
  registryAssemblyAtDoorOnly,
  untrustedRegexSafeExec,
  zodErrorIssuesHome,
  zodModernSpellings,
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
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project: projectOf(files), reviewedGrants: grants, failOnWarnings: false });
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
// RECEIPT REFUSALS. Four policies LOCATE a subject and refuse when it is gone — the final form of the
// legacy blindness arms (`canonicalSeen === 0`, `dumpSites === 0`) and rename tripwires, which conformance
// cannot express because a refusal is a TOOL ERROR rather than a finding.
// ---------------------------------------------------------------------------------------------------
test("plugin-dump-guard REFUSES when the membrane has no guest-dump site left to judge", () => {
  const blind = passOf(pluginDumpGuard, {
    "packages/server/src/infra/plugin-host/membrane.ts": "export const attach = null;\n",
  });

  expect(blind.toolErrors).toMatchObject([{ policyId: "plugin-dump-guard", phase: "receipt" }]);
  expect(blind.authority.withheldPolicyIds).toEqual(["plugin-dump-guard"]);
  expect(blind.authority.effectiveFindings).toEqual([]);
});

test("untrusted-regex-safe-exec REFUSES when the canonical composition seam disappears", () => {
  const gone = passOf(untrustedRegexSafeExec, {
    "packages/server/src/entry/compose/chat.ts": "export const unrelated = 1;\n",
  });

  expect(gone.toolErrors).toMatchObject([{ policyId: "untrusted-regex-safe-exec", phase: "receipt" }]);
  expect(gone.authority.withheldPolicyIds).toEqual(["untrusted-regex-safe-exec"]);
});

test("untrusted-regex-safe-exec is not laundered by a SAFE seam in another compose module", () => {
  const laundered = passOf(untrustedRegexSafeExec, {
    "packages/server/src/kit/regex/index.ts": "export declare function createRegexTest(timeoutMs?: number): (regex: RegExp, haystack: string) => boolean;\n",
    "packages/server/src/entry/compose/chat.ts": "export const unrelated = 1;\n",
    "packages/server/src/entry/compose/other.ts":
      'import { createRegexTest } from "../../kit/regex/index.ts";\nexport const other = { testRegexKey: createRegexTest() };\n',
  });

  // The seam count is one, so the receipt does NOT refuse — and the canonical file still has no seam, which
  // is the disappearance this policy exists to catch. Written as a pin because the legacy gate counted the
  // canonical property ONLY, and a naive count over the whole population would read this as healthy.
  expect(laundered.toolErrors).toMatchObject([{ policyId: "untrusted-regex-safe-exec", phase: "receipt" }]);
});

test("persisted-store-registry REFUSES when a persist factory home no longer exports its factory", () => {
  const renamed = passOf(persistedStoreRegistry, {
    "packages/client/src/state/create-persisted-store.ts": "export declare function createStore(name: string): unknown;\n",
    "packages/client/src/state/create-entity-draft-store.ts": "export declare function createEntityDraftStore(options: { name: string }): unknown;\n",
  });

  expect(renamed.toolErrors).toMatchObject([{ policyId: "persisted-store-registry", phase: "receipt" }]);
  expect(renamed.policies[0]?.receipts).toEqual([
    { kind: "population", source: "packages/client/src/state/create-entity-draft-store.ts", members: 1, unresolved: 0 },
    { kind: "population", source: "packages/client/src/state/create-persisted-store.ts", members: 0, unresolved: 1 },
  ]);
});

// #2029 — the header used to promise that a MOVED door refuses, while the two doors shared ONE summed receipt:
// an absent persist home (`members 0 / unresolved 0`) beside a present draft home (`members 1`) summed to a
// clean `members 1`, so the run passed with no provable `createPersistedStore` mint. Each door is now its own
// receipt; this is the shape the sum could not see, in both directions.
test("persisted-store-registry REFUSES when exactly ONE factory door is absent from the fileset", () => {
  const draftOnly = passOf(persistedStoreRegistry, {
    "packages/client/src/state/create-entity-draft-store.ts": "export declare function createEntityDraftStore(options: { name: string }): unknown;\n",
  });
  const persistOnly = passOf(persistedStoreRegistry, {
    "packages/client/src/state/create-persisted-store.ts": "export declare function createPersistedStore(name: string, initial: () => unknown): unknown;\n",
  });

  expect(draftOnly.toolErrors).toMatchObject([{ policyId: "persisted-store-registry", phase: "receipt" }]);
  expect(draftOnly.authority.withheldPolicyIds).toEqual(["persisted-store-registry"]);
  expect(persistOnly.toolErrors).toMatchObject([{ policyId: "persisted-store-registry", phase: "receipt" }]);
  expect(persistOnly.authority.withheldPolicyIds).toEqual(["persisted-store-registry"]);
});

test("persisted-store-registry does NOT refuse when both doors are present and exporting — the control for the arm above", () => {
  const both = passOf(persistedStoreRegistry, {
    "packages/client/src/state/create-persisted-store.ts": "export declare function createPersistedStore(name: string, initial: () => unknown): unknown;\n",
    "packages/client/src/state/create-entity-draft-store.ts": "export declare function createEntityDraftStore(options: { name: string }): unknown;\n",
  });

  expect(both.toolErrors).toEqual([]);
  expect(both.policies[0]?.receipts).toEqual([
    { kind: "population", source: "packages/client/src/state/create-entity-draft-store.ts", members: 1, unresolved: 0 },
    { kind: "population", source: "packages/client/src/state/create-persisted-store.ts", members: 1, unresolved: 0 },
  ]);
});

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
    "packages/server/src/domain/x/verb.ts":
      "// @orb-waive no-inline-types(Foo): the proof's stand-in reason and its end condition.\nexport type Foo = string;\n",
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("a waiver naming the WRONG position suppresses nothing and reports a dead position", () => {
  const mismatched = passOf(noInlineTypes, {
    "packages/server/src/domain/x/verb.ts": "// @orb-waive no-inline-types(Bar): names a type this carrier does not declare.\nexport type Foo = string;\n",
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
// GRANT LIVENESS. Five of these policies' authority IS the central table, so the verdicts that make a row
// honest are pinned on real policies rather than assumed. `no-untyped-soft-ref` is pinned specifically
// because its subject is NOT a path — it is the SQL `table.column` pair, which is what survives a schema
// module being renamed.
// ---------------------------------------------------------------------------------------------------
const SOFT_REF_SCHEMA = {
  "packages/db/src/schema/x.ts":
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("t", { widgetId: text("widget_id") });\n',
};
const SOFT_REF_GRANT = {
  id: "no-untyped-soft-ref:proof",
  policyId: "no-untyped-soft-ref",
  subject: "t.widgetId",
  operation: "soft-reference",
  why: "the proof's stand-in for a real D24 soft-reference row",
  endsWhen: "the pin stops exercising a soft reference",
};

test("a soft-reference grant licenses its exact table.column pair and is consumed exactly once", () => {
  const granted = passOf(noUntypedSoftRef, SOFT_REF_SCHEMA, [SOFT_REF_GRANT]);

  expect(granted.authority.effectiveFindings).toEqual([]);
  expect(granted.authority.grantedFindings).toHaveLength(1);
  expect(granted.authority.reviewedGrantConsumption).toEqual([{ id: SOFT_REF_GRANT.id, count: 1 }]);
  expect(granted.authority.authorityAlarms).toEqual([]);
});

test("a soft-reference grant keyed on the FILE rather than the pair licenses nothing", () => {
  const mismatched = passOf(noUntypedSoftRef, SOFT_REF_SCHEMA, [{ ...SOFT_REF_GRANT, subject: "packages/db/src/schema/x.ts" }]);

  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant" }]);
});

test("a soft-reference grant that matches nothing after a complete run is STALE", () => {
  const stale = passOf(
    noUntypedSoftRef,
    {
      "packages/db/src/schema/x.ts":
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const w = sqliteTable("w", { id: text("id").primaryKey() });\nexport const t = sqliteTable("t", { widgetId: text("widget_id").references(() => w.id) });\n',
    },
    [SOFT_REF_GRANT],
  );

  expect(stale.authority.effectiveFindings).toEqual([]);
  expect(stale.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: SOFT_REF_GRANT.id }]);
});

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
