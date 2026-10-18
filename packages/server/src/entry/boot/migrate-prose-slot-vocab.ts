// Boot step: the #1737 prose-slot id vocabulary DATA migration (owner-ruled 2026-09-05, arm (a)) — the
// `migrate-handoff-offer-vocab` sibling, over `presets.config`'s `promptConfig.prose` map.
//
// It is a boot step rather than a `0000_baseline.sql` line for the same reason its sibling is: the rename
// carries NO DDL — the column is plain TEXT and only the JSON KEY inside it moved
// (`$.prose."chat.group.castMember"` → `$.prose."chat.group.characterHeading"`). A baseline regen would not
// rewrite a single blob, and pre-launch the baseline is squashed rather than forward-only (Tier-1-DB
// §"Regime 1"), so there is no incremental migration file to hang a data rewrite on.
//
// It runs unconditionally on every boot rather than behind a "has it run?" flag: the rewrite is idempotent by
// its own predicate (it matches only a config that still carries the old key), so a marker column would be a
// second source of truth that could disagree with the data. The cost of the no-op boot is one indexless scan
// of the preset library.

import type { Db } from "@orb/db";
import { migrateProseSlotVocab } from "#domain/preset";
import { getLog } from "#foundation/observability";

export interface MigrateProseSlotVocabDeps {
  readonly db: Db;
}

/** Re-key every pre-#1737 stored prose override onto the current slot id. Returns the number of preset rows
 *  rewritten — 0 on every boot after the first, and on a db that never carried the old spelling. */
export async function migrateProseSlotVocabOnBoot(deps: MigrateProseSlotVocabDeps): Promise<number> {
  const rewritten = await migrateProseSlotVocab(deps.db);
  if (rewritten > 0) {
    getLog().info({ rewritten }, "boot/migrate-prose-slot-vocab: re-keyed pre-#1737 prose overrides to `chat.group.characterHeading`");
  }
  return rewritten;
}
