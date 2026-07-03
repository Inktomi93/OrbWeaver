// domain/embeddings/persistence/clear — the typed `DELETE FROM` over a primary vector table (the
// `clearTable` maintenance verb's query half). Moved from the neo `db/vector-ops.ts` to the domain that
// OWNS the tables.
//
// LOAD-BEARING (carried verbatim from neo-tavern): a plain `DELETE FROM` is SAFE here because there is NO
// ANN/DiskANN shadow index over these `F32_BLOB` columns — search is an exact `ORDER BY
// vector_distance_cos(...) LIMIT k` scan (sub-ms + 100% recall at this corpus scale, Tier-1-DB.md esoteric #1), so
// deleting rows leaves no orphaned index segment to vacuum/rebuild. If a libSQL ANN index is ever added,
// this comment is the tripwire: a bare DELETE would then desync the shadow index.

import type { Db } from "@orb/db";
import { characterEmbeddings, chatDigests, chatSegments, imageEmbeddings } from "@orb/db";
import type { VectorTable } from "../contract/params";

function assertNever(value: never): never {
  throw new Error(`clearVectorTable: unhandled vector table ${String(value)}`);
}

/** Wipe every row of a primary vector table. Dispatch is `assertNever`-exhaustive over {@link VectorTable}
 *  (a new table fails `tsc` until its arm lands). Safe without an index rebuild — see the file header. */
export async function clearVectorTable(db: Db, table: VectorTable): Promise<void> {
  switch (table) {
    case "character_embeddings":
      await db.delete(characterEmbeddings);
      return;
    case "image_embeddings":
      await db.delete(imageEmbeddings);
      return;
    case "chat_digests":
      await db.delete(chatDigests);
      return;
    case "chat_segments":
      await db.delete(chatSegments);
      return;
    default:
      assertNever(table);
  }
}
