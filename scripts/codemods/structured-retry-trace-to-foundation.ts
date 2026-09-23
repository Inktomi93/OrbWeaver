// One-shot codemod: the two domain-local structured-retry trace adapters (discovery, refinery) collapse into ONE
// helper in `foundation/observability`. Repoints every importer of either twin at the observability front door
// and deletes both twins. The foundation helper and its barrel export are hand edits made before this runs.
//
// Preview:  NODE_OPTIONS=--max-old-space-size=16384 node scripts/codemods/structured-retry-trace-to-foundation.ts
// Apply:    NODE_OPTIONS=--max-old-space-size=16384 node scripts/codemods/structured-retry-trace-to-foundation.ts --apply

import process from "node:process";
import type { CodemodContext } from "@orb/tooling/codemod";
import { deleteFiles, repointImports, runCodemod } from "@orb/tooling/codemod";

const FRONT_DOOR = "#foundation/observability";

await runCodemod(
  "structured-retry-trace-to-foundation",
  (ctx: CodemodContext) => {
    ctx.plan(repointImports(ctx, "../substrate/structured-retry-trace.ts", FRONT_DOOR));
    ctx.plan(repointImports(ctx, "./structured-retry-trace.ts", FRONT_DOOR));
    ctx.plan(
      deleteFiles(
        ctx,
        ["packages/server/src/domain/discovery/substrate/structured-retry-trace.ts", "packages/server/src/domain/refinery/substrate/structured-retry-trace.ts"],
        { confirm: true },
      ),
    );
  },
  { argv: process.argv.slice(2) },
);
