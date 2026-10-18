// Boot step: the #1649 host-handoff offer vocabulary DATA migration (owner-ruled 2026-09-05, arm (a)).
//
// It is a boot step rather than a `0000_baseline.sql` line because the rename carries NO DDL — the column is
// plain TEXT and only the JSON KEY inside it moved (`$.copyCast` → `$.copyCharacters`). A baseline regen
// would not have rewritten a single blob, and pre-launch the baseline is squashed rather than forward-only
// (Tier-1-DB §"Regime 1"), so there is no incremental migration file to hang a data rewrite on.
//
// It runs unconditionally on every boot rather than behind a "has it run?" flag: the rewrite is idempotent by
// its own predicate (it matches only a blob that still carries the old key), so a marker column would be a
// second source of truth that could disagree with the data. The cost of the no-op boot is one indexless scan
// of a table with at most a handful of non-null offer blobs.

import type { Db } from "@orb/db";
import { migrateHandoffOfferVocab } from "#domain/chat";
import { getLog } from "#foundation/observability";

export interface MigrateHandoffOfferVocabDeps {
  readonly db: Db;
}

/** Rewrite every pre-#1649 `pending_handoff_offer` blob to the current key spelling. Returns the number of
 *  rows rewritten — 0 on every boot after the first, and on a db that never carried the old spelling. */
export async function migrateHandoffOfferVocabOnBoot(deps: MigrateHandoffOfferVocabDeps): Promise<number> {
  const rewritten = await migrateHandoffOfferVocab(deps.db);
  if (rewritten > 0) {
    getLog().info({ rewritten }, "boot/migrate-handoff-offer-vocab: rewrote pre-#1649 handoff offers to `copyCharacters`");
  }
  return rewritten;
}
