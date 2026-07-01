// The structural-gate orchestrator: registers every ts-morph/fs check and runs them.
// Wired into `pnpm check` (after biome + tsc). Add a gate by dropping it in gates/ and listing it here.
// The catalog of every enforcement (these gates + biome rules + grit + dep-cruiser) and the deferred
// backlog lives in docs/architecture/core/Core-Laws-and-Precedents.md.

import { assumesSingleReplica } from "./gates/assumes-single-replica.ts";
import { commentedCode } from "./gates/commented-code.ts";
import { dbStructure } from "./gates/db-structure.ts";
import { featureStructure } from "./gates/feature-structure.ts";
import { noCallerUserId } from "./gates/no-caller-user-id.ts";
import { noDirectUsersRead } from "./gates/no-direct-users-read.ts";
import { noInlineUnionRedecl } from "./gates/no-inline-union-redecl.ts";
import { pdCitationIntegrity } from "./gates/pd-citation-integrity.ts";
import { providersRunnerSeal } from "./gates/providers-runner-seal.ts";
import { schemaBranding } from "./gates/schema-branding.ts";
import { soleEnvReader } from "./gates/sole-env-reader.ts";
import { testDeterminism } from "./gates/test-determinism.ts";
import { testLayout } from "./gates/test-layout.ts";
import { testPresence } from "./gates/test-presence.ts";
import { typesInContract } from "./gates/types-in-contract.ts";
import { verbNaming } from "./gates/verb-naming.ts";
import { testMockDoctrine } from "./gates/test-mock-doctrine.ts";
import { testFactoryContract } from "./gates/test-factory-contract.ts";
import { testFixtureImports } from "./gates/test-fixture-imports.ts";
import { testNoStubs } from "./gates/test-no-stubs.ts";
import { serverLayout } from "./gates/server-layout.ts";
import { packageLayout } from "./gates/package-layout.ts";
import { runChecks } from "./harness.ts";

runChecks([
  featureStructure,
  testLayout,
  verbNaming,
  typesInContract,
  noInlineUnionRedecl,
  testPresence,
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
]);
