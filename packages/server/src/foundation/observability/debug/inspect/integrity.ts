// foundation/observability/debug/inspect/integrity — the whole-DB integrity probe: the foreign_key_check and
// integrity_check pragmas, read through their table-valued functions so the probe needs only {@link ReadOnlyDb}'s
// `select` (a SELECT cannot write). Warns (via the structured logger) on any issue. Reads @orb/db DOWN.

import type { ReadOnlyDb } from "@orb/db";
import { sql } from "drizzle-orm";
import type { IntegrityReport } from "#src/foundation/observability/contract/inspect.ts";
import type { Logger } from "#src/foundation/observability/contract/logging.ts";
import { getLog } from "#src/foundation/observability/logger.ts";

export type { IntegrityReport } from "#src/foundation/observability/contract/inspect.ts";

/** Run both integrity pragmas; a finding warns through the request's logger or else the root's `base`. */
export async function integrityProbe(db: ReadOnlyDb, base: Logger): Promise<IntegrityReport> {
  const fk = await db
    .select({
      table: sql<string>`"table"`,
      rowid: sql<number | null>`rowid`,
      parent: sql<string>`parent`,
      fkid: sql<number>`fkid`,
    })
    .from(sql`pragma_foreign_key_check`);
  const ic = await db.select({ result: sql<string>`integrity_check` }).from(sql`pragma_integrity_check`);
  const integrityCheck = ic.map((r) => r.result).filter((s) => s.length > 0);
  const ok = fk.length === 0 && integrityCheck.every((s) => s === "ok");
  if (!ok) {
    getLog(base).warn({ fkViolations: fk.length, integrityCheck }, "debug: db integrity check found issues");
  }
  return { ok, foreignKeyViolations: fk, integrityCheck };
}
