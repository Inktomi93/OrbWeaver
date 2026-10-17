// The per-account seed ledger (D263): which seed-manifest keys an account has been given. A recorded key is
// never seeded again, so a deleted seeded item stays deleted; recording is idempotent on the (user, key) key.

import { userSeedLedger } from "@orb/db";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { ReadSeededKeys } from "../contract/composed-ops.ts";

/** The manifest keys this account has already been given. */
export async function listSeededItemKeys(handle: DatabaseHandle, userId: UserId): Promise<readonly string[]> {
  const db = databaseForOwner(handle);
  const rows = await db.select({ itemKey: userSeedLedger.itemKey }).from(userSeedLedger).where(eq(userSeedLedger.userId, userId));
  return rows.map((row) => row.itemKey);
}

/** Record that this account has been given these keys. A key already recorded keeps its first time. */
export async function recordSeededItemKeys(handle: DatabaseHandle, userId: UserId, itemKeys: readonly string[], at: number): Promise<void> {
  const db = databaseForOwner(handle);
  if (itemKeys.length === 0) {
    return;
  }
  await db
    .insert(userSeedLedger)
    .values(itemKeys.map((itemKey) => ({ userId, itemKey, seededAt: at })))
    .onConflictDoNothing();
}

/** The seeder needs set membership, not row order; the owner read remains in the ledger producer. */
export function createReadSeededKeys(db: DatabaseHandle): ReadSeededKeys {
  return async (userId): Promise<ReadonlySet<string>> => new Set(await listSeededItemKeys(db, userId));
}
