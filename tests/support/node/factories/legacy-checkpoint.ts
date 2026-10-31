// Releases v0.1.0 to v0.2.0 pinned a checkpoint to the head turn row, and v0.3.x pinned a hand copy stamped at
// the tail, until migration 0006 gave each one a bookmark (`packages/db/src/migrations/0006_bookmark-checkpoint-snapshots.sql`).
// This plants those states on the chain before 0006.

import type { MessageId, MessageVariantId, RpgCheckpointId, RpgGameId, RpgSnapshotId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";

/** One snapshot row a pre-0006 release left: a turn row keyed to its variant, or a hand row at its as-of slot. */
export type LegacySnapshot =
  | { readonly messageId: MessageId; readonly variantId: MessageVariantId; readonly location: string; readonly createdAt: number }
  | { readonly asOfMessageId: MessageId | null; readonly location: string; readonly createdAt: number };

export interface PlantedLegacyCheckpoint {
  readonly snapshotIds: readonly RpgSnapshotId[];
  readonly checkpointId: RpgCheckpointId;
}

/**
 * Plant a game's committed snapshot rows and a checkpoint created at `at` that pins the row at `pinned`, in the
 * table shapes the chain before 0006 holds. Raw SQL on purpose: every production rpg snapshot read names 0006's
 * `kind` column.
 */
export async function plantLegacyCheckpoint(
  root: ServerProducerRoot,
  args: { readonly gameId: RpgGameId; readonly rows: readonly LegacySnapshot[]; readonly pinned: number; readonly label: string; readonly at: number },
): Promise<PlantedLegacyCheckpoint> {
  const snapshotIds: RpgSnapshotId[] = [];
  for (const row of args.rows) {
    const id = mintTypeId(ID_PREFIX.rpgSnapshot);
    snapshotIds.push(id);
    const keys =
      "variantId" in row ? { messageId: row.messageId, variantId: row.variantId, asOf: null } : { messageId: null, variantId: null, asOf: row.asOfMessageId };
    await root.db.run(sql`insert into rpg_snapshots (id, game_id, message_id, variant_id, as_of_message_id, location, committed, created_at)
      values (${id}, ${args.gameId}, ${keys.messageId}, ${keys.variantId}, ${keys.asOf}, ${row.location}, 1, ${row.createdAt})`);
  }
  const target = snapshotIds[args.pinned];
  if (target === undefined) {
    throw new Error("the pinned row is not among the planted rows");
  }
  const checkpointId = mintTypeId(ID_PREFIX.rpgCheckpoint);
  await root.db.run(sql`insert into rpg_checkpoints (id, game_id, snapshot_id, label, trigger, created_at)
    values (${checkpointId}, ${args.gameId}, ${target}, ${args.label}, 'manual', ${args.at})`);
  return { snapshotIds, checkpointId };
}
