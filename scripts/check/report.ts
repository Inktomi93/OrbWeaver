// The structural-gate orchestrator: registers every ts-morph/fs check and runs them.
// Wired into `pnpm check` (after biome + tsc). Add a gate by importing it and listing it here.

import { featureStructure } from "./feature-structure.ts";
import { runChecks } from "./harness.ts";
import { noInlineUnionRedecl } from "./no-inline-union-redecl.ts";
import { schemaBranding } from "./schema-branding.ts";
import { testLayout } from "./test-layout.ts";
import { verbNaming } from "./verb-naming.ts";

runChecks([featureStructure, testLayout, verbNaming, noInlineUnionRedecl, schemaBranding]);
