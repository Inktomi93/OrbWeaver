// The structural-gate orchestrator: registers every ts-morph/fs check and runs them.
// Wired into `pnpm check` (after biome + tsc). Add a gate by importing it and listing it here.

import { featureStructure } from "./feature-structure.ts";
import { runChecks } from "./harness.ts";
import { noInlineUnionRedecl } from "./no-inline-union-redecl.ts";
import { testLayout } from "./test-layout.ts";

runChecks([featureStructure, testLayout, noInlineUnionRedecl]);
