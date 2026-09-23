// One-shot codemod: the per-wire JSON-Schema subset tables and their scrub engine move from `@orb/kit/json-schema`
// to `@orb/contracts/inference`. The projection engine (`projectJsonSchema`, the lift) stays in kit. Moves the
// module and its test, then routes each moved symbol's importers to the new specifier while every other
// `@orb/kit/json-schema` symbol keeps its import. The kit barrel's re-export and the contracts barrel's export are
// hand edits after this runs.
//
// Preview:  NODE_OPTIONS=--max-old-space-size=16384 node scripts/codemods/wire-subset-to-contracts.ts
// Apply:    NODE_OPTIONS=--max-old-space-size=16384 node scripts/codemods/wire-subset-to-contracts.ts --apply

import process from "node:process";
import type { CodemodContext } from "@orb/tooling/codemod";
import { moveFiles, routeSymbolsByMap, runCodemod } from "@orb/tooling/codemod";

const TO = "@orb/contracts/inference";

await runCodemod(
  "wire-subset-to-contracts",
  (ctx: CodemodContext) => {
    ctx.plan(
      moveFiles(ctx, [
        ["packages/kit/src/json-schema/wire-subset.ts", "packages/contracts/src/inference/wire-subset.ts"],
        ["tests/kit/json-schema/wire-subset.test.ts", "tests/contracts/inference/wire-subset.test.ts"],
      ]),
    );
    ctx.plan(
      routeSymbolsByMap(ctx, "@orb/kit/json-schema", {
        dropNullValues: TO,
        scrubWireSchema: TO,
        WIRE_SCHEMA_MODES: TO,
        WIRE_SUBSETS: TO,
        WireSchemaMode: TO,
        WireSchemaScrub: TO,
      }),
    );
  },
  { argv: process.argv.slice(2) },
);
