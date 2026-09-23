// domain/rpg/persistence/checkpoints — labeled snapshot bookmarks (docs/plans/rpg/design.md). Create (label a
// snapshot) · list · read (the restore target). RESTORE ITSELF is composed in the verb layer (W1b): it
// reads the checkpointed snapshot, then clone-forwards it BORN COMMITTED through
// `buildRestoredSnapshotStatement` (persistence/snapshots), committed beside the visible narrator marker —
// this slot owns only checkpoint rows. The snapshot FK is RESTRICT (a restore broken because the snapshot
// vanished must be a constraint error, not a silent dangle). No JSON columns — no parse-on-read belt.
// `id`/`now` injected.

import type { Db } from "@orb/db";
import { rpgCheckpoints } from "@orb/db";
import type { RpgCheckpointId, RpgGameId } from "@orb/kit/ids";
import { desc, eq } from "drizzle-orm";
import type { NewRpgCheckpoint, RpgCheckpointRow } from "../contract/service.ts";

/** Create a checkpoint row pointing at a snapshot. */
export async function insertCheckpoint(db: Db, values: NewRpgCheckpoint): Promise<RpgCheckpointRow> {
  const rows = await db.insert(rpgCheckpoints).values(values).returning();
  const row = rows[0];
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
