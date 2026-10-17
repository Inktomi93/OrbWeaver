// foundation/observability/debug/inspect/integrity — the whole-DB integrity probe: PRAGMA
// foreign_key_check + integrity_check. Warns (via the structured logger) on any issue. Reads @orb/db DOWN.

import type { Db } from "@orb/db";
import { sql } from "drizzle-orm";
import { getLog } from "#src/foundation/observability/logger.ts";

import type { IntegrityReport } from "../../contract/inspect.ts";

export type { IntegrityReport } from "../../contract/inspect.ts";

export async function integrityProbe(db: Db): Promise<IntegrityReport> {
  const fk = await db.all<Record<string, unknown>>(sql`PRAGMA foreign_key_check`);
  const ic = await db.all<Record<string, string>>(sql`PRAGMA integrity_check`);
  // integrity_check returns one unnamed column per row — take the value without keying on the (snake_case)
  // column name (sidesteps the Biome⇄tsc literal-key dance).
  const integrityCheck = ic.map((r) => Object.values(r)[0] ?? "").filter((s) => s.length > 0);
  const ok = fk.length === 0 && integrityCheck.every((s) => s === "ok");
  if (!ok) {
    getLog().warn({ fkViolations: fk.length, integrityCheck }, "debug: db integrity check found issues");
  }
  return { ok, foreignKeyViolations: fk, integrityCheck };
}
