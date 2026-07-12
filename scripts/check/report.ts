// The structural-gate orchestrator: registers every ts-morph/fs check and runs them.
// Wired into `pnpm check` (after biome + tsc). Add a gate by dropping it in gates/ and listing it here.
// The catalog of every enforcement (these gates + biome rules + grit + dep-cruiser) lives in
// docs/architecture/core/Core-Enforcement-Active-Gates.md; the deferred backlog in
// Core-Enforcement-Deferred-Dropped.md.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { assetRefsFkCoverage } from "./gates/asset-refs-fk-coverage.ts";
import { assumesSingleReplica } from "./gates/assumes-single-replica.ts";
import { baselineSingleMigration } from "./gates/baseline-single-migration.ts";
import { busCoverage } from "./gates/bus-coverage.ts";
import { busOnDataNoStoreWrite } from "./gates/bus-onData-no-store-write.ts";
import { clientStructure } from "./gates/client-structure.ts";
import { commentedCode } from "./gates/commented-code.ts";
import { componentSize } from "./gates/component-size.ts";
import { contentPartSeam } from "./gates/content-part-seam.ts";
import { contractVerbPresence } from "./gates/contract-verb-presence.ts";
import { dbEnumFromTuple } from "./gates/db-enum-from-tuple.ts";
import { dbStructure } from "./gates/db-structure.ts";
import { diagnosticLegibility } from "./gates/diagnostic-legibility.ts";
import { emptyStateHasAction } from "./gates/empty-state-has-action.ts";
import { createEnforcementRegistryParity } from "./gates/enforcement-registry-parity.ts";
import { featureStructure } from "./gates/feature-structure.ts";
import { formFactoryForMultifield } from "./gates/form-factory-for-multifield.ts";
import { infraAuthNoUserId } from "./gates/infra-auth-no-userid.ts";
import { memberCardClamped } from "./gates/member-card-clamped.ts";
import { membershipEnforcer } from "./gates/membership-enforcer.ts";
import { modalBodyNotPlaceholder } from "./gates/modal-body-not-placeholder.ts";
import { noArbitraryTwValues } from "./gates/no-arbitrary-tw-values.ts";
import { noArrayLiteralQuerykey } from "./gates/no-array-literal-querykey.ts";
import { noCallerUserId } from "./gates/no-caller-user-id.ts";
import { noDirectUsersRead } from "./gates/no-direct-users-read.ts";
import { noEffectOnSharedSelection } from "./gates/no-effect-on-shared-selection.ts";
import { noFormResetInAutosave } from "./gates/no-form-reset-in-autosave.ts";
import { noInlineInvalidateOutsideSeam } from "./gates/no-inline-invalidate-outside-seam.ts";
import { noInlineUnionRedecl } from "./gates/no-inline-union-redecl.ts";
import { noInteractiveRoleInFeatures } from "./gates/no-interactive-role-in-features.ts";
import { noOffTokenRadiusShadow } from "./gates/no-off-token-radius-shadow.ts";
import { noRawEgress } from "./gates/no-raw-egress.ts";
import { noRawInteractiveIntrinsics } from "./gates/no-raw-interactive-intrinsics.ts";
import { noTestFabrication } from "./gates/no-test-fabrication.ts";
import { noUntypedSoftRef } from "./gates/no-untyped-soft-ref.ts";
import { ownerRoleSplit } from "./gates/owner-role-split.ts";
import { ownerIdRegistry } from "./gates/ownerid-registry.ts";
import { packageLayout } from "./gates/package-layout.ts";
import { pdCitationIntegrity } from "./gates/pd-citation-integrity.ts";
import { persistPartializeAndTotalMigrate } from "./gates/persist-partialize-and-total-migrate.ts";
import { persistenceBoundary } from "./gates/persistence-boundary.ts";
import { placeholderCopyRegistry } from "./gates/placeholder-copy-registry.ts";
import { providersRunnerSeal } from "./gates/providers-runner-seal.ts";
import { registryPairing } from "./gates/registry-pairing.ts";
import { schemaBannedShapes } from "./gates/schema-banned-shapes.ts";
import { schemaBranding } from "./gates/schema-branding.ts";
import { serverLayout } from "./gates/server-layout.ts";
import { soleEnvReader } from "./gates/sole-env-reader.ts";
import { stateFiles } from "./gates/state-files.ts";
import { surfaceA11yFocus } from "./gates/surface-a11y-focus.ts";
import { surfaceInAContainer } from "./gates/surface-in-a-container.ts";
import { testDeterminism } from "./gates/test-determinism.ts";
import { testFactoryContract } from "./gates/test-factory-contract.ts";
import { testFixtureImports } from "./gates/test-fixture-imports.ts";
import { testLayout } from "./gates/test-layout.ts";
import { testMockDoctrine } from "./gates/test-mock-doctrine.ts";
import { testNoStubs } from "./gates/test-no-stubs.ts";
import { testPresence } from "./gates/test-presence.ts";
import { testPresenceClient } from "./gates/test-presence-client.ts";
import { turnIdentity } from "./gates/turn-identity.ts";
import { typesInContract } from "./gates/types-in-contract.ts";
import { uiPrimitiveStructure } from "./gates/ui-primitive-structure.ts";
import { userBusCoverage } from "./gates/user-bus-coverage.ts";
import { vectorScopeDerived } from "./gates/vector-scope-derived.ts";
import { verbNaming } from "./gates/verb-naming.ts";
import { warningCodeCoverage } from "./gates/warning-code-coverage.ts";
import { zustandSelectorDerived } from "./gates/zustand-selector-derived.ts";
import type { Check, GateResult, RunChecksResult } from "./harness.ts";
import { runChecks } from "./harness.ts";

// Every gate EXCEPT enforcement-registry-parity, which needs the FULL name list (itself included) to
// check doc/registry parity — built separately below to avoid a report.ts↔gate import cycle (see
// enforcement-registry-parity.ts's header).
const BASE_CHECKS: readonly Check[] = [
  featureStructure,
  testLayout,
  verbNaming,
  typesInContract,
  noArrayLiteralQuerykey,
  noInlineInvalidateOutsideSeam,
  busOnDataNoStoreWrite,
  noFormResetInAutosave,
  persistPartializeAndTotalMigrate,
  noInlineUnionRedecl,
  testPresence,
  testPresenceClient,
  testDeterminism,
  commentedCode,
  schemaBranding,
  dbStructure,
  baselineSingleMigration,
  providersRunnerSeal,
  noDirectUsersRead,
  noCallerUserId,
  pdCitationIntegrity,
  soleEnvReader,
  assumesSingleReplica,
  testMockDoctrine,
  testFactoryContract,
  testFixtureImports,
  testNoStubs,
  serverLayout,
  packageLayout,
  uiPrimitiveStructure,
  clientStructure,
  stateFiles,
  zustandSelectorDerived,
  noEffectOnSharedSelection,
  noInteractiveRoleInFeatures,
  noRawInteractiveIntrinsics,
  emptyStateHasAction,
  persistenceBoundary,
  componentSize,
  vectorScopeDerived,
  turnIdentity,
  membershipEnforcer,
  ownerRoleSplit,
  busCoverage,
  userBusCoverage,
  memberCardClamped,
  diagnosticLegibility,
  surfaceA11yFocus,
  surfaceInAContainer,
  registryPairing,
  modalBodyNotPlaceholder,
  placeholderCopyRegistry,
  // Ledger-gate wave (2026-07-09) — activated once the doc freeze lifted + each verified 0-violation on
  // the real tree (self-tested in tests/tooling/<gate>.int.test.ts).
  ownerIdRegistry,
  noUntypedSoftRef,
  dbEnumFromTuple,
  schemaBannedShapes,
  warningCodeCoverage,
  infraAuthNoUserId,
  contentPartSeam,
  noRawEgress,
  // Test-coverage / type-safety ratchets (2026-07-09, test-support-dry-punchlist.md §5 / W2c) — the
  // interface-level complement to test-presence + the fabrication-cast ratchet.
  contractVerbPresence,
  noTestFabrication,
  // D54 §13.3/§13.4 form-factory gate — activated 2026-07-09 once its ONE real-tree hit
  // (chat/components/group-config-form.tsx) was migrated onto createAutosaveEntityForm (0-violation).
  formFactoryForMultifield,
  // design-enforcement.md §3 — the last PLANNED gate in the doc (2026-07-11).
  noArbitraryTwValues,
  // design-enforcement.md §3, DC8 rollup-audit blind spot (2026-07-12) — the default-scale twin of
  // no-arbitrary-tw-values (that gate catches brackets only; this one catches off-token rounded-*/
  // shadow-* utilities on the stock Tailwind scale).
  noOffTokenRadiusShadow,
  // task #114 — every schema FK→assets.id column must be classified in asset-refs.ts's registry
  // (the static, pre-commit half of the runtime asset-refs.int.test.ts invariant).
  assetRefsFkCoverage,
];

/** Every registered gate, in run order. Exported for the scoped mid-tier runner (file.ts), which
 *  filters this list by touched-path zone — importing this module does NOT run anything (the
 *  is-main guard below fires only under `tsx scripts/check/report.ts`, i.e. `pnpm check:structure`). */
export const ALL_CHECKS: readonly Check[] = [
  ...BASE_CHECKS,
  createEnforcementRegistryParity([
    ...BASE_CHECKS.map((c) => c.name),
    "enforcement-registry-parity",
  ]),
];

/** JSON shape for `reports/check-structure.json` — the read-don't-rerun artifact
 *  `scripts/check/show.ts` renders. `gates` is exactly `RunChecksResult["gates"]`. */
interface StructureReport {
  readonly gates: readonly GateResult[];
  readonly total: number;
  readonly ok: boolean;
}

/** Additive JSON companion to the stdout report — written UNCONDITIONALLY (clean or dirty run
 *  alike), strictly AFTER `runChecks` has already printed, so it can never change stdout or the
 *  exit code (verified: `diff` of a captured `pnpm check:structure` run before vs after this
 *  function existed is empty). Consumes the SAME `runChecks` result the is-main block already
 *  computed — no second gate execution (the four whole-project scanners are the dominant cost;
 *  they now run exactly once per `pnpm check:structure`, not twice). */
function writeStructureReport(root: string, result: RunChecksResult): void {
  const report: StructureReport = {
    gates: result.gates,
    total: result.total,
    ok: result.total === 0,
  };
  const reportsDir = join(root, "reports");
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, "check-structure.json"), `${JSON.stringify(report, null, 2)}\n`);
}

// Direct-run guard: `pnpm check:structure` (tsx runs this file as the entrypoint) executes every
// gate exactly as before — same output, same exit(1)-on-violation; an import (file.ts) gets the
// list only. argv[1] is the tsx entry script, so the URL comparison is the ESM "is main" idiom.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  const result = runChecks(ALL_CHECKS);
  writeStructureReport(process.cwd(), result);
  if (result.total > 0) {
    process.exit(1);
  }
}
