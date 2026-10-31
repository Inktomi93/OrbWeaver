// Labeled checkpoints; each one's bookmark snapshot shares its write batch, and the composite FK admits only it.
// Restore owns its narrator/state batch in the verb; the snapshot FK remains RESTRICT.

import type { Db } from "@orb/db";
import { rpgCheckpoints } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchMany, batchStmt } from "@orb/db/query";
import type { RpgCheckpointId, RpgGameId } from "@orb/kit/ids";
import { desc, eq } from "drizzle-orm";
import type { NewRpgCheckpoint, RpgCheckpointRow } from "../contract/service.ts";

/** Commit the checkpoint and its bookmark snapshot together, without a durable half on failure. */
export async function insertCheckpoint(db: Db, values: NewRpgCheckpoint, bookmark: BatchStmt): Promise<RpgCheckpointRow> {
  await db.batch(batchMany([bookmark, batchStmt(db.insert(rpgCheckpoints).values(values))]));
  const row = await findCheckpoint(db, values.id);
  if (!row) {
    throw new Error("insertCheckpoint: no row returned");
  }
  return row;
}

/** All checkpoints for a game, newest-first. */
export function listCheckpoints(db: Db, gameId: RpgGameId): Promise<RpgCheckpointRow[]> {
  return db.select().from(rpgCheckpoints).where(eq(rpgCheckpoints.gameId, gameId)).orderBy(desc(rpgCheckpoints.createdAt), desc(rpgCheckpoints.id));
}

/** One checkpoint by id (the restore target — the verb reads its `snapshotId`), or `undefined`. */
export async function findCheckpoint(db: Db, id: RpgCheckpointId): Promise<RpgCheckpointRow | undefined> {
  const rows = await db.select().from(rpgCheckpoints).where(eq(rpgCheckpoints.id, id)).limit(1);
  return rows[0];
}
