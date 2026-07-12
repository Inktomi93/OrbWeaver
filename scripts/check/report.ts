// The structural-gate orchestrator (`pnpm check:structure`). POST-V5-CUTOVER: the entrypoint runs the
// SINGLE-PASS machine (loadGates auto-discovers every scripts/check/gates/*.ts descriptor → runPass → one
// walk → renderPass) as the LIVE gate authority. Add a gate by DROPPING it in gates/ — the loader IS the
// registry (no hand-listing). The `ALL_CHECKS`/`BASE_CHECKS` legacy arrays below are RETAINED as the parity
// ORACLE (the per-gate int tests + single-pass-parity drive them) and no longer gate — they retire with the
// per-gate int-test review (the ts-morph audit's phase-5 tail). The catalog of every enforcement lives in
// docs/architecture/core/Core-Enforcement-Active-Gates.md; the deferred backlog in
// Core-Enforcement-Deferred-Dropped.md.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { GateDescriptor } from "./contract.ts";
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
import { motionTokenPurity } from "./gates/motion-token-purity.ts";
import { noArbitraryTwValues } from "./gates/no-arbitrary-tw-values.ts";
import { noArrayLiteralQuerykey } from "./gates/no-array-literal-querykey.ts";
import { noCallerUserId } from "./gates/no-caller-user-id.ts";
import { noDirectUsersRead } from "./gates/no-direct-users-read.ts";
import { noEffectOnSharedSelection } from "./gates/no-effect-on-shared-selection.ts";
import { noFormResetInAutosave } from "./gates/no-form-reset-in-autosave.ts";
import { noInlineInvalidateOutsideSeam } from "./gates/no-inline-invalidate-outside-seam.ts";
import { noInlineUnionRedecl } from "./gates/no-inline-union-redecl.ts";
import { noInteractiveRoleInFeatures } from "./gates/no-interactive-role-in-features.ts";
import { noOffTokenInlineStyle } from "./gates/no-off-token-inline-style.ts";
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
import { verifyRegistryParity } from "./gates/verify-registry-parity.ts";
import { warningCodeCoverage } from "./gates/warning-code-coverage.ts";
import { zustandSelectorDerived } from "./gates/zustand-selector-derived.ts";
import type { Check, GateResult, Violation } from "./harness.ts";
import { loadGates } from "./loader.ts";
import type { PassResult } from "./pass.ts";
import { projectCtx, runPass } from "./pass.ts";
import { renderPass } from "./render.ts";

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
  // BASEUI-MOTION-AUDIT.md §5 Layer 3 (2026-07-12) — the CSS motion-token twin of the radius/shadow gate:
  // bans a raw duration/easing in a transition/animation declaration where a --motion-*/--ease-* token
  // belongs (the source arm of the never-desync guarantee; co-motion vars + a rendered-parity CT are the
  // other two layers).
  motionTokenPurity,
  // design-enforcement.md §3 (2026-07-12) — the inline/imperative arm the className + CSS token gates
  // can't see: a token-backed CSS property written as a raw literal in a JSX `style={{…}}` object or an
  // imperative `.style`/`setProperty` (the last token-enforcement hole). A `var(--…)` inline value passes.
  noOffTokenInlineStyle,
  // task #114 — every schema FK→assets.id column must be classified in asset-refs.ts's registry
  // (the static, pre-commit half of the runtime asset-refs.int.test.ts invariant).
  assetRefsFkCoverage,
  // UNIFIED-VERIFICATION-DESIGN.md §3.6 — every package.json verification-shaped script must be a `pnpm
  // verify` stage (the registry is the ledger that makes a forgotten script structurally impossible).
  verifyRegistryParity,
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

// ── V5 CUTOVER (TSMORPH-SINGLE-PASS-AUDIT.md phases 4–5) ───────────────────────────────────────────────
// `pnpm check:structure` now runs the SINGLE-PASS machine (loadGates → runPass → renderPass) as the LIVE
// gate authority — ONE forEachDescendant walk over one shared workspace, per-gate try/catch (a thrown gate
// is a native tool-error → exit 2, not a laundered violation). The legacy `runChecks(ALL_CHECKS)` path is
// retained above ONLY as the parity ORACLE (tests/tooling/single-pass-parity.int.test.ts + the per-gate
// int tests drive it); it no longer gates. Whole-run parity is proven LIVE: the single-pass finding SET
// equals the legacy set on the real tree (both clean today) and a break-confirm catches an introduced
// violation exactly as legacy would — see the acceptance evidence in the V5 report.
const EXIT_CLEAN = 0;
const EXIT_VIOLATIONS = 1;
const EXIT_TOOL_ERROR = 2;

/** Map the single-pass PassResult into the legacy `check-structure.json` shape (show.ts's consumer):
 *  each gate's per-occurrence findings collapse into `{file,line,message}` violations, where the message
 *  is the finding's own override or — the common case — the gate descriptor's `message` (the reason lives
 *  ONCE on the descriptor). A gate that TOOL-ERRORED is reported with a synthetic violation so the JSON +
 *  the total reflect the broken checker. */
function toStructureReport(
  pass: PassResult,
  gatesByName: ReadonlyMap<string, GateDescriptor>,
): StructureReport {
  const gates: GateResult[] = pass.gates.map((g) => {
    const descriptor = gatesByName.get(g.name);
    const violations: Violation[] = g.findings.map((f) => ({
      file: f.file,
      line: f.line,
      message: f.message ?? descriptor?.message ?? g.name,
    }));
    return { name: g.name, ok: violations.length === 0, violations };
  });
  const total = gates.reduce((n, g) => n + g.violations.length, 0);
  return { gates, total, ok: total === 0 && pass.toolErrors.length === 0 };
}

function writeStructureReport(root: string, report: StructureReport): void {
  const reportsDir = join(root, "reports");
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, "check-structure.json"), `${JSON.stringify(report, null, 2)}\n`);
}

/** The single-pass run entrypoint: load the descriptors, run ONE pass, render, write the JSON, exit on the
 *  0/1/2/3 scheme (2 when any gate threw — the checker is broken; 1 on violations; 0 clean). */
async function runSinglePass(root: string): Promise<void> {
  const gates = await loadGates(root);
  const gatesByName = new Map(gates.map((g) => [g.name, g]));
  const pass = runPass(gates, projectCtx(root));

  process.stdout.write(renderPass(pass, gatesByName));
  process.stdout.write("\n");

  const report = toStructureReport(pass, gatesByName);
  writeStructureReport(root, report);

  if (pass.toolErrors.length > 0) {
    process.exit(EXIT_TOOL_ERROR); // a gate threw — the checker is broken, not your code
  }
  if (report.total > 0) {
    process.exit(EXIT_VIOLATIONS);
  }
  process.exitCode = EXIT_CLEAN;
}

// Direct-run guard: `pnpm check:structure` (tsx runs this file as the entrypoint) runs the single-pass
// machine; an import (the parity oracle) gets the ALL_CHECKS list only (the is-main guard fires
// only under `tsx scripts/check/report.ts`).
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await runSinglePass(process.cwd());
}
