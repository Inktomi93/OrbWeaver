// verb: fsck — READ-ONLY integrity report over the whole asset store (PD-26). Three faults:
//   • danglingRows — an index row whose blob is missing (`!cas.exists`). The drop-row-BEFORE-blob ordering
//     makes this never-supposed-to-happen; a non-zero count means an out-of-band row insert or a lost blob.
//   • corruptBlobs — a PRESENT blob whose bytes no longer hash to their name (`cas.verify` re-hash mismatch)
//     — silent bit-rot.
//   • orphanBlobs — a blob with no index row (a crash/DR leak; `collectGarbage`/`rebuildFromTree` reclaim it).
// Mutates NOTHING. UN-PRINCIPAL (D20) — an ops/DR surface. The dangling/corrupt pass drives off the DB owner
// list (an owner whose blobs all vanished has no CAS dir but still owns rows); the orphan pass drives off the
// CAS tree.

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Cas } from "#infra/storage";
import type { AssetsContext } from "../context";
import type { AssetsService } from "../contract/service";
import { listAssetOwners, loadOwnerAssetRows } from "../persistence/maintenance";

/** Per-owner dangling+corrupt tally over the index rows. `!exists` ⇒ dangling; present-but-`!verify` ⇒
 *  corrupt (verify returns `false` on a re-hash mismatch of a PRESENT blob; a missing blob is already the
 *  dangling branch). */
async function checkOwnerRows(
  db: Db,
  cas: Cas,
  ownerId: UserId,
  signal: AbortSignal | undefined,
): Promise<{ scannedRows: number; danglingRows: number; corruptBlobs: number }> {
  const rows = await loadOwnerAssetRows(db, ownerId);
  let scannedRows = 0;
  let danglingRows = 0;
  let corruptBlobs = 0;
  for (const row of rows) {
    signal?.throwIfAborted();
    scannedRows++;
    // biome-ignore lint/performance/noAwaitInLoops: per-row integrity probe — a read-only maintenance scan, sequenced deliberately (not a hot path).
    if (!(await cas.exists(ownerId, row.hash))) {
      danglingRows++;
      continue;
    }
    if (!(await cas.verify(ownerId, row.hash))) {
      corruptBlobs++;
    }
  }
  return { scannedRows, danglingRows, corruptBlobs };
}

export function createFsck(ctx: AssetsContext): AssetsService["fsck"] {
  return async (options) => {
    const signal = options?.signal;
    let scannedRows = 0;
    let danglingRows = 0;
    let corruptBlobs = 0;
    let scannedBlobs = 0;
    let orphanBlobs = 0;

    for (const ownerId of await listAssetOwners(ctx.db)) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential per-owner row scan — read-only maintenance, not a hot path.
      const t = await checkOwnerRows(ctx.db, ctx.cas, ownerId, signal);
      scannedRows += t.scannedRows;
      danglingRows += t.danglingRows;
      corruptBlobs += t.corruptBlobs;
    }

    for await (const owner of ctx.cas.listOwners()) {
      const ownerId = castId<UserId>(owner);
      const rowHashes = new Set((await loadOwnerAssetRows(ctx.db, ownerId)).map((r) => r.hash));
      for await (const hash of ctx.cas.listHashes(ownerId)) {
        signal?.throwIfAborted();
        scannedBlobs++;
        if (!rowHashes.has(hash)) {
          orphanBlobs++;
        }
      }
    }

    return { scannedRows, scannedBlobs, danglingRows, corruptBlobs, orphanBlobs };
  };
}
