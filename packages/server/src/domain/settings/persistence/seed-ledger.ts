// The per-account seed ledger (D263): which seed-manifest keys an account has been given. A recorded key is
// never seeded again, so a deleted seeded item stays deleted; recording is idempotent on the (user, key) key.

import type { Db } from "@orb/db";
import { userSeedLedger } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

/** The manifest keys this account has already been given. */
export async function listSeededItemKeys(db: Db, userId: UserId): Promise<readonly string[]> {
  const rows = await db.select({ itemKey: userSeedLedger.itemKey }).from(userSeedLedger).where(eq(userSeedLedger.userId, userId));
  return rows.map((row) => row.itemKey);
}

/** Record that this account has been given these keys. A key already recorded keeps its first time. */
export async function recordSeededItemKeys(db: Db, userId: UserId, itemKeys: readonly string[], at: number): Promise<void> {
  if (itemKeys.length === 0) {
    return;
  }
  await db
    .insert(userSeedLedger)
    .values(itemKeys.map((itemKey) => ({ userId, itemKey, seededAt: at })))
    .onConflictDoNothing();
}
