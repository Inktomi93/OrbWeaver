// The standing conformance + differential net for the fourth SIMPLE-tier wave (#1584/#1943): four pure
// syntax policies converted from free-form `visitFile`/descendant-walk descriptors into kind-indexed
// `defineGate` visitors with all state moved into `create`.
//
//   no-default-props                        — a plain member-name match, unchanged shape.
//   test-no-stubs                           — state moved into per-file test/assertion lists, reconciled
//                                              by node-range containment in `evaluate` (never a private
//                                              descendant walk).
//   no-form-state-in-useeffect              — the legacy `deps.forEachDescendant` walk inverted into a
//                                              direct MEMBER_ACCESS_KINDS subscription plus an ancestor
//                                              climb (#1506 identity-not-spelling preserved).
//   persist-partialize-and-total-migrate    — ARM A (bare `persist(` outside the factories) RETIRED as a
//                                              duplicate of `no-raw-zustand-persist`'s stronger `persistMint`
//                                              reviewed-grant arm; only ARM B (factory options completeness)
//                                              survives under this id, and since #1954 ARM B reports ONE
//                                              finding per call site rather than one per missing key, so its
//                                              ordinary waiver door is addressable at all.
//
// Same recipe as simple-visitors-wave-2.test.ts: `verifyPolicyProofs` runs each final policy's own proofs
// through the production runtime; the differential replays every ORIGINAL mustFlag/mustPass example from
// the frozen pre-conversion source (172485b3a, the commit immediately before this wave) through both the
// legacy dispatcher and the final one; and a successor-proof section replays persist-partialize's retired
// ARM A examples through `no-raw-zustand-persist` instead, so the retirement is a receipt, not a dropped rule.
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { zustandProof } from "../../../../tooling/src/verify/gates/_proof/zustand.ts";
import { gate as noDefaultProps } from "../../../../tooling/src/verify/gates/no-default-props.ts";
import { gate as noFormStateInUseeffect } from "../../../../tooling/src/verify/gates/no-form-state-in-useeffect.ts";
import { gate as noRawZustandPersist } from "../../../../tooling/src/verify/gates/no-raw-zustand-persist.ts";
import { gate as persistPartializeAndTotalMigrate } from "../../../../tooling/src/verify/gates/persist-partialize-and-total-migrate.ts";
import { gate as testNoStubs } from "../../../../tooling/src/verify/gates/test-no-stubs.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/simple-visitors-wave-4";

const FAMILY: readonly GatePolicy[] = [noDefaultProps, testNoStubs, noFormStateInUseeffect, persistPartializeAndTotalMigrate];

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

test("the converted fourth-wave policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// ORDINARY MARKER IDENTITY: no-default-props and no-form-state-in-useeffect are both ordinary. A marker
// naming THIS finding's own policy at its own position suppresses it; a marker naming a DIFFERENT known
// ordinary policy at the same position must not.
// ---------------------------------------------------------------------------------------------------
test("a correctly-addressed ordinary waiver on no-default-props suppresses the finding", () => {
  const waived = passOf(noDefaultProps, {
    "packages/ui/src/MyComponent.tsx":
      "// @orb-waive no-default-props(defaultProps): temporary legacy interop, tracked in #0000.\nMyComponent.defaultProps = { id: 1 };\n",
  });
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("a waiver naming a DIFFERENT known ordinary policy at the same position suppresses nothing", () => {
  const mismatched = runPolicyPass({
    knownPolicies: [noDefaultProps, noFormStateInUseeffect],
    policies: [noDefaultProps, noFormStateInUseeffect],
    root: ROOT,
    project: projectOf({
      "packages/ui/src/MyComponent.tsx":
        "// @orb-waive no-form-state-in-useeffect(defaultProps): wrong policy id entirely.\nMyComponent.defaultProps = { id: 1 };\n",
    }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.effectiveFindings[0]?.policyId).toBe("no-default-props");
});

test("the ordinary waiver door on persist-partialize-and-total-migrate is REACHABLE — the #1954 defect", () => {
  const waived = passOf(persistPartializeAndTotalMigrate, {
    "packages/client/src/state/create-persisted-store.ts":
      "// @orb-waive persist-partialize-and-total-migrate(persist): probe — the ordinary door must be reachable.\nexport const s = persist(() => ({}), {});\n",
  });
  // Before the collapse this same fixture produced three byte-identical findings, so the marker resolved
  // `over-broad` and suppressed NONE of them — an ordinary policy whose only recourse was editing the
  // factory it objected to.
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// SUCCESSOR PROOF for the retired ARM A: every legacy persist-partialize mustFlag/mustPass example that
// exercised the bare-persist-outside-factories rule still holds — now judged by no-raw-zustand-persist's
// `persistMint` operation, which is IDENTITY-based (readPackageExportOrigin) rather than the legacy's bare
// `getText() === "persist"` text match.
// ---------------------------------------------------------------------------------------------------
const REGISTRY_PROOF = {
  "packages/client/src/state/durable-local.ts": [
    "interface RegisteredStore {",
    "  readonly api: { readonly persist?: { readonly setOptions: (options: unknown) => void } };",
    "  readonly reset: () => void;",
    "}",
    "const registry: RegisteredStore[] = [];",
    "export function registerDurableLocalStore(entry: RegisteredStore): void {",
    "  registry.push(entry);",
    "}",
    "function resetWithoutPersisting(entry: RegisteredStore): void {",
    "  entry.api.persist?.setOptions({});",
    "  entry.reset();",
    "}",
    "export function resetAll(): void {",
    "  for (const entry of registry) {",
    "    resetWithoutPersisting(entry);",
    "  }",
    "}",
    "",
  ].join("\n"),
};

function successorPass(files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: [noRawZustandPersist],
    policies: [noRawZustandPersist],
    root: ROOT,
    project: projectOf({ ...zustandProof(), ...REGISTRY_PROOF, ...files }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("no-raw-zustand-persist still flags the retired legacy ARM A example — the successor, not a dropped rule", () => {
  const result = successorPass({
    "packages/client/src/features/x/store.ts": "import { persist } from 'zustand/middleware';\nexport const s = persist(() => ({}), {});\n",
  });
  expect(result.authority.effectiveFindings.length).toBeGreaterThan(0);
});

test("no-raw-zustand-persist still passes the retired legacy ARM A mustPass example — the factory mint", () => {
  const result = successorPass({
    "packages/client/src/features/x/store2.ts":
      "import { createPersistedStore } from '../../state/create-persisted-store.ts';\nexport const s = createPersistedStore('x');\n",
    "packages/client/src/state/create-persisted-store.ts": "export declare function createPersistedStore(name: string): unknown;\n",
  });
  expect(result.authority.effectiveFindings).toEqual([]);
});
