// Real-corpus liveness arms (#2149) for policies whose declared population spans `@db` product-schema
// files (item 0107/0108's chunk — held back until the ambient/module-identity door fix landed: before it,
// `byte-check-cast` traced every `sql.raw(...)` call through `resolveModuleMemberOrigin` and drizzle-orm's
// merged `sql` (a function merged with a namespace) always refused as `ambiguous`, so `isDrizzleExport`
// answered false for EVERY real `sql.raw` call and the policy never saw a live subject to report on). DATA,
// collected by the one runner (`../real-corpus-liveness-family.suite.repo.int.test.ts`), which loads the
// structure run's own corpus once and runs every arm against it (docs/work/0043).
import { gate as byteCheckCast } from "../../../../../tooling/src/verify/gates/byte-check-cast.ts";
import type { RealCorpusLivenessArm, RealCorpusOverlay } from "../../../../support/real-corpus-liveness.ts";

function add(path: string, source: string): RealCorpusOverlay {
  return { kind: "add", path, source };
}

export const PRODUCT_DB_SERVER_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: byteCheckCast,
    // `byte-check-cast`'s own mustFlag row (the founding shape), planted verbatim: a `*_MAX_BYTES` cap over
    // a bare `length(value)` with no cast — SQLite `length()` on TEXT counts code points, not bytes.
    overlays: [
      add(
        "packages/db/src/schema/liveness-byte-row.ts",
        'import { sql } from "drizzle-orm";\n' +
          'import { check, sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          "const KV_VALUE_MAX_BYTES = 65536;\n" +
          'export const t = sqliteTable("t", { value: text("value") }, () => [\n' +
          '  check("t_value_check", sql.raw(`length(value) <= ${KV_VALUE_MAX_BYTES}`)),\n' +
          "]);\n",
      ),
    ],
    messageIncludes: "SQLite `length()` on TEXT counts CODE POINTS, not bytes",
  },
];
