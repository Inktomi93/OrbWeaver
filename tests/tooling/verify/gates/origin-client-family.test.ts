// Conformance entry for the twelve client-side policies whose only missing primitive was canonical
// symbol/member origin. Every proof runs through the production dispatcher on an isolated population.
import { Project } from "ts-morph";
import { gate as fetchFnInFeatures } from "../../../../tooling/src/verify/gates/fetch-fn-in-features.ts";
import { gate as noChatTrpcInSurface } from "../../../../tooling/src/verify/gates/no-chat-trpc-in-surface.ts";
import { gate as noContextProvider } from "../../../../tooling/src/verify/gates/no-context-provider.ts";
import { gate as noContextReturntype } from "../../../../tooling/src/verify/gates/no-context-returntype.ts";
import { gate as noForwardRef } from "../../../../tooling/src/verify/gates/no-forward-ref.ts";
import { gate as noInlineOptimisticInSurface } from "../../../../tooling/src/verify/gates/no-inline-optimistic-in-surface.ts";
import { gate as noManualAutosaveFlush } from "../../../../tooling/src/verify/gates/no-manual-autosave-flush.ts";
import { gate as noManualTokenEstimate } from "../../../../tooling/src/verify/gates/no-manual-token-estimate.ts";
import { gate as noMultiplexedMutationError } from "../../../../tooling/src/verify/gates/no-multiplexed-mutation-error.ts";
import { gate as noStaticStaletime } from "../../../../tooling/src/verify/gates/no-static-staletime.ts";
import { gate as noUseContext } from "../../../../tooling/src/verify/gates/no-use-context.ts";
import { gate as zustandSelectorStability } from "../../../../tooling/src/verify/gates/zustand-selector-stability.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the canonical-origin client policies keep their founding, respelling and nearest-legal fixtures", () => {
  expect(
    verifyPolicyProofs([
      fetchFnInFeatures,
      noChatTrpcInSurface,
      noContextProvider,
      noContextReturntype,
      noForwardRef,
      noInlineOptimisticInSurface,
      noManualAutosaveFlush,
      noManualTokenEstimate,
      noMultiplexedMutationError,
      noStaticStaletime,
      noUseContext,
      zustandSelectorStability,
    ]),
  ).toEqual([]);
}, 240_000);

const ROOT = "/origin-client-family";

const STORE_HOOK_TYPE =
  "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare function createGatedStore<T>(name: string, initial: T): GatedStoreHook<T>;\n";
const STORE_USE =
  'import { createGatedStore } from "../state/create-gated-store.ts";\nconst useUserStore = createGatedStore("user", { user: "a" });\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n';
const ENTITY_TYPE = "export interface EntityMutationResult {\n  readonly error: unknown;\n}\n";
const ENTITY_USE =
  'import type { EntityMutationResult } from "../../data/create-entity-mutation.ts";\nexport const g = (a: EntityMutationResult, b: EntityMutationResult): unknown => a.error ?? b.error;\n';

function passOf(policy: Parameters<typeof runPolicyPass>[0]["policies"][number], files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

test("the store-hook home is a blindness tripwire: a rename REFUSES the verdict instead of passing every selector", () => {
  const healthy = passOf(zustandSelectorStability, {
    "packages/client/src/state/create-gated-store.ts": STORE_HOOK_TYPE,
    "packages/client/src/components/foo.tsx": STORE_USE,
  });
  expect(healthy.toolErrors).toEqual([]);
  expect(healthy.authority.withheldPolicyIds).toEqual([]);
  expect(healthy.authority.effectiveFindings).toMatchObject([{ policyId: "zustand-selector-stability", token: "useUserStore" }]);
  expect(healthy.policies[0]?.receipts).toEqual([{ kind: "population", source: "GatedStoreHook", members: 1, unresolved: 0 }]);

  // The home file still exists but no longer exports the hook type — the exact shape of a rename.
  const renamed = passOf(zustandSelectorStability, {
    "packages/client/src/state/create-gated-store.ts": "export type BoundStoreHook<T> = {\n  (): T;\n};\nexport declare const unused: number;\n",
    "packages/client/src/components/foo.tsx":
      "declare function useUserStore<U>(selector: (state: { user: string }) => U): U;\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n",
  });
  expect(renamed.toolErrors).toMatchObject([{ policyId: "zustand-selector-stability", phase: "receipt", message: expect.stringContaining("GatedStoreHook") }]);
  expect(renamed.authority.withheldPolicyIds).toEqual(["zustand-selector-stability"]);
  expect(renamed.authority.effectiveFindings).toEqual([]);
});

test("the mutation-result home is a blindness tripwire on the same contract", () => {
  const healthy = passOf(noMultiplexedMutationError, {
    "packages/client/src/data/create-entity-mutation.ts": ENTITY_TYPE,
    "packages/client/src/features/x/x.tsx": ENTITY_USE,
  });
  expect(healthy.toolErrors).toEqual([]);
  expect(healthy.authority.effectiveFindings).toMatchObject([{ policyId: "no-multiplexed-mutation-error" }]);
  expect(healthy.policies[0]?.receipts).toEqual([{ kind: "population", source: "EntityMutationResult", members: 1, unresolved: 0 }]);

  const renamed = passOf(noMultiplexedMutationError, {
    "packages/client/src/data/create-entity-mutation.ts": "export interface MutationChannel {\n  readonly error: unknown;\n}\n",
    "packages/client/src/features/x/x.tsx":
      'import type { MutationChannel } from "../../data/create-entity-mutation.ts";\nexport const g = (a: MutationChannel, b: MutationChannel): unknown => a.error ?? b.error;\n',
  });
  expect(renamed.toolErrors).toMatchObject([
    { policyId: "no-multiplexed-mutation-error", phase: "receipt", message: expect.stringContaining("EntityMutationResult") },
  ]);
  expect(renamed.authority.withheldPolicyIds).toEqual(["no-multiplexed-mutation-error"]);
  expect(renamed.authority.effectiveFindings).toEqual([]);
});
