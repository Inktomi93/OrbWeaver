// Releases v0.1.0 to v0.2.0 pinned a checkpoint to the head turn row until migration 0006 re-pinned it
// (`packages/db/src/migrations/0006_bookmark-checkpoint-snapshots.sql`). This plants that state on the chain before 0006.

import type { MessageId, MessageVariantId, RpgCheckpointId, RpgGameId, RpgSnapshotId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";

/** One turn row the pre-0006 flush left: the variant it is keyed to and the location it records. */
export interface LegacyTurnSnapshot {
  readonly messageId: MessageId;
  readonly variantId: MessageVariantId;
  readonly location: string;
  readonly createdAt: number;
}

export interface PlantedTurnPinnedCheckpoint {
  readonly snapshotIds: readonly RpgSnapshotId[];
  readonly checkpointId: RpgCheckpointId;
}

/**
 * Plant a game's committed turn rows and a checkpoint pinned to the turn at `pinned`, in the table shapes the chain
 * before 0006 holds. Raw SQL on purpose: every production rpg snapshot read names 0006's derived `kind` column.
 */
export async function plantTurnPinnedCheckpoint(
  root: ServerProducerRoot,
  args: { readonly gameId: RpgGameId; readonly turns: readonly LegacyTurnSnapshot[]; readonly pinned: number; readonly label: string; readonly at: number },
): Promise<PlantedTurnPinnedCheckpoint> {
  const snapshotIds: RpgSnapshotId[] = [];
  for (const turn of args.turns) {
    const id = mintTypeId(ID_PREFIX.rpgSnapshot);
    snapshotIds.push(id);
    await root.db.run(sql`insert into rpg_snapshots (id, game_id, message_id, variant_id, location, committed, created_at)
      values (${id}, ${args.gameId}, ${turn.messageId}, ${turn.variantId}, ${turn.location}, 1, ${turn.createdAt})`);
  }
  const target = snapshotIds[args.pinned];
  if (target === undefined) {
    throw new Error("the pinned turn is not among the planted turns");
  }
  const checkpointId = mintTypeId(ID_PREFIX.rpgCheckpoint);
  await root.db.run(sql`insert into rpg_checkpoints (id, game_id, snapshot_id, label, trigger, created_at)
    values (${checkpointId}, ${args.gameId}, ${target}, ${args.label}, 'manual', ${args.at})`);
  return { snapshotIds, checkpointId };
}
