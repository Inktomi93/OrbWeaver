// The structural-gate orchestrator: registers every ts-morph/fs check and runs them.
// Wired into `pnpm check` (after biome + tsc). Add a gate by dropping it in gates/ and listing it here.
// The catalog of every enforcement (these gates + biome rules + grit + dep-cruiser) lives in
// docs/architecture/core/Core-Enforcement-Active-Gates.md; the deferred backlog in
// Core-Enforcement-Deferred-Dropped.md.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { assumesSingleReplica } from "./gates/assumes-single-replica.ts";
import { busCoverage } from "./gates/bus-coverage.ts";
import { clientStructure } from "./gates/client-structure.ts";
import { commentedCode } from "./gates/commented-code.ts";
import { componentSize } from "./gates/component-size.ts";
import { dbStructure } from "./gates/db-structure.ts";
import { diagnosticLegibility } from "./gates/diagnostic-legibility.ts";
import { featureStructure } from "./gates/feature-structure.ts";
import { memberCardClamped } from "./gates/member-card-clamped.ts";
import { membershipEnforcer } from "./gates/membership-enforcer.ts";
import { noCallerUserId } from "./gates/no-caller-user-id.ts";
import { noDirectUsersRead } from "./gates/no-direct-users-read.ts";
import { noInlineUnionRedecl } from "./gates/no-inline-union-redecl.ts";
import { ownerRoleSplit } from "./gates/owner-role-split.ts";
import { packageLayout } from "./gates/package-layout.ts";
import { pdCitationIntegrity } from "./gates/pd-citation-integrity.ts";
import { providersRunnerSeal } from "./gates/providers-runner-seal.ts";
import { schemaBranding } from "./gates/schema-branding.ts";
import { serverLayout } from "./gates/server-layout.ts";
import { soleEnvReader } from "./gates/sole-env-reader.ts";
import { stateFiles } from "./gates/state-files.ts";
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
import { vectorScopeDerived } from "./gates/vector-scope-derived.ts";
import { verbNaming } from "./gates/verb-naming.ts";
import { zustandSelectorDerived } from "./gates/zustand-selector-derived.ts";
import type { Check, GateResult, RunChecksResult } from "./harness.ts";
import { runChecks } from "./harness.ts";

/** Every registered gate, in run order. Exported for the scoped mid-tier runner (file.ts), which
 *  filters this list by touched-path zone — importing this module does NOT run anything (the
 *  is-main guard below fires only under `tsx scripts/check/report.ts`, i.e. `pnpm check:structure`). */
export const ALL_CHECKS: readonly Check[] = [
  featureStructure,
  testLayout,
  verbNaming,
  typesInContract,
  noInlineUnionRedecl,
  testPresence,
  testPresenceClient,
  testDeterminism,
  commentedCode,
  schemaBranding,
  dbStructure,
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
  componentSize,
  vectorScopeDerived,
  turnIdentity,
  membershipEnforcer,
  ownerRoleSplit,
  busCoverage,
  memberCardClamped,
  diagnosticLegibility,
  surfaceInAContainer,
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
