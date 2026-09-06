// Boot step: the #1708 pre-#1702 plugin-provenance DATA repair — the `migrate-prose-slot-vocab` /
// `migrate-handoff-offer-vocab` shape one table over.
//
// It is a boot step rather than a workload for the same reason those two are: a card ingested through a
// plugin BEFORE #1702 shipped still reads "Made here" on EVERY read of that character until this runs, so
// the repair is a floor a read needs under it, not an owner-scheduled sweep — the workloads engine's own
// admission/lane machinery (`domain/workloads` header) exists for LONG, cancellable, per-owner passes, and
// this is neither: it is a one-time, whole-table data repair that must be settled before any character read
// can trust `importedFrom`, exactly like the two prose/handoff vocabulary rewrites it sits beside.
//
// Idempotent by predicate (see `backfillPluginProvenance`'s own header) — a marker column here would be a
// second source of truth the data could disagree with, and the cost of the no-op boot is one indexless scan
// of the character table for the (importedFrom IS NULL AND importHash IS NOT NULL) slice.

import type { Db } from "@orb/db";
import type { BackfillPluginProvenanceResult } from "#domain/character";
import { backfillPluginProvenance } from "#domain/character";
import { getLog } from "#foundation/observability";

export interface BackfillPluginProvenanceOnBootDeps {
  readonly db: Db;
}

/** Stamp `importedFrom` for every pre-#1702 plugin-ingested character whose plugin identity is recoverable.
 *  Returns the counts `backfillPluginProvenance` reported — both 0 on every boot after the candidate set is
 *  drained, and on a db that never carried a pre-#1702 plugin ingest. */
export async function backfillPluginProvenanceOnBoot(deps: BackfillPluginProvenanceOnBootDeps): Promise<BackfillPluginProvenanceResult> {
  const result = await backfillPluginProvenance(deps.db);
  if (result.backfilled > 0 || result.leftAuthored > 0) {
    getLog().info(result, "boot/backfill-plugin-provenance: reconciled pre-#1702 plugin-ingested character provenance");
  }
  return result;
}
