// Boot step: the #1600 legacy-background-pin ONE-TIME DATA heal (heal, not narrow — the fork + its default
// is recorded in `domain/settings/persistence/heal-legacy-background-pins.ts`'s header).
//
// It is a boot step rather than a `0000_baseline.sql` line for the usual reason: the fix carries no DDL —
// `user_settings.config` is a plain JSON column and the heal only clears stale KEYS inside it. It runs
// unconditionally on every boot rather than behind a "has it run?" flag: the heal is idempotent by its own
// predicate (a row with no stale pin is left untouched), so a marker column would be a second source of
// truth that could disagree with the data. The cost of the no-op boot is one full scan of `user_settings`
// (a per-user, not per-message, table — bounded by the user count, not chat volume) plus one `assets` lookup
// per row that pins a background.

import type { Db } from "@orb/db";
import { healLegacyBackgroundPins } from "#domain/settings";
import { getLog } from "#foundation/observability";

export interface HealLegacyBackgroundPinsDeps {
  readonly db: Db;
}

/** Clear every pre-#1478 stale background pin. Returns the number of `user_settings` rows rewritten — 0 on
 *  every boot after the first, and on a db seeded entirely post-#1478. */
export async function healLegacyBackgroundPinsOnBoot(deps: HealLegacyBackgroundPinsDeps): Promise<number> {
  const healed = await healLegacyBackgroundPins(deps.db);
  if (healed > 0) {
    getLog().info({ healed }, "boot/heal-legacy-background-pins: cleared stale pre-#1478 background pins");
  }
  return healed;
}
