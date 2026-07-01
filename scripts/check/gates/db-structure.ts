// Gate: db-structure — the barrel-completeness half of the db schema layout discipline (ENFORCEMENT.md
// "db-structure"; tiers/db.md "producer-names-the-schema rule"). Every `packages/db/src/schema/<file>.ts`
// MUST be re-exported from the barrel `schema/index.ts`: a schema file missing from the barrel is silently
// dropped from `typeof schema` — its tables vanish from migrations AND the drizzle relational query API
// with NO error. This gate makes that omission RED. Generic (no hardcoded file list).
//
// DEFERRED (Phase 4) FLAG[PD-92]: the producer-names-schema MIRROR half — asserting `schema/<feature>.ts` mirrors a
// `domain/<feature>` producer — needs the `domain/` tree, which does not exist until the server package is
// built. Activate that arm here when domains land (it is the half that catches consumer-named lies like the
// retired `search.ts`/`corpus.ts`). Until then, barrel-completeness is the checkable, load-bearing half.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import type { Check, CheckContext, Violation } from "../harness.ts";

const SCHEMA_REL = "packages/db/src/schema";
const BARREL_FILE = "index.ts";
const BARREL_SUFFIX = "/packages/db/src/schema/index.ts";
const TS_EXT_RE = /\.ts$/u;

function findBarrel(ctx: CheckContext): SourceFile | undefined {
  return ctx.project.getSourceFiles().find((sf) => sf.getFilePath().endsWith(BARREL_SUFFIX));
}

export const dbStructure: Check = {
  name: "db-structure",
  run: (ctx): Violation[] => {
    let entries: readonly string[];
    try {
      entries = readdirSync(join(ctx.root, SCHEMA_REL));
    } catch {
      return []; // no schema dir yet (pre-Phase-3) — nothing to assert.
    }
    const files = entries.filter((f) => f.endsWith(".ts") && f !== BARREL_FILE);
    if (files.length === 0) {
      return [];
    }
    const barrel = findBarrel(ctx);
    if (barrel === undefined) {
      return [
        {
          file: `${SCHEMA_REL}/${BARREL_FILE}`,
          line: 0,
          message:
            "the schema barrel index.ts is missing — every schema file must be re-exported from it.",
        },
      ];
    }
    const reExported = new Set(
      barrel
        .getExportDeclarations()
        .map((d) => d.getModuleSpecifierValue())
        .filter((s): s is string => s !== undefined),
    );
    const violations: Violation[] = [];
    for (const f of files) {
      const spec = `./${f.replace(TS_EXT_RE, "")}`;
      if (!reExported.has(spec)) {
        violations.push({
          file: `${SCHEMA_REL}/${f}`,
          line: 0,
          message: `schema file is NOT re-exported from the barrel schema/index.ts — add \`export * from "${spec}";\` or its tables silently vanish from \`typeof schema\` (migrations + the relational query API).`,
        });
      }
    }
    return violations;
  },
};
