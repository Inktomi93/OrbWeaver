// domain/embeddings/persistence/clear — the typed DELETE FROM over a primary vector table.
//
// A plain DELETE FROM is safe here because there is no ANN/DiskANN shadow index over these F32_BLOB
// columns — search is an exact ORDER BY vector_distance_cos(...) scan. If a libSQL ANN index is ever
// added, this comment is the tripwire: a bare DELETE would then desync the shadow index.

import type { Db } from "@orb/db";
import { characterEmbeddings, chatDigests, chatSegments, imageEmbeddings } from "@orb/db";
import { ne } from "drizzle-orm";
import type { VectorTable } from "../contract/params";

function assertNever(value: never): never {
  throw new Error(`clearVectorTable: unhandled vector table ${String(value)}`);
}

// FLAG[PD-104]: DEAD — `clearVectorTable` (the whole-table wipe) has ZERO runtime consumers (test-only,
// PD-103-style). Superseded by `purgeStaleVectors` below (the model-scoped OLD-space reclaim that the
// PD-104 purge+reindex path actually needs — a full wipe would also nuke the NEW space). Delete this +
// the `clearTable` verb/param/service-method + their tests once file-removal tooling is in hand (this
// pass is Edit-only). Registry row: Core-Audits-and-Debt.md PD-104.
/** Dispatch is assertNever-exhaustive over {@link VectorTable} — a new table fails tsc until its arm lands. */
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

/** PD-104 — the OLD-vector-space reclaim half of purge+reindex. Deletes every row in `table` whose `model`
 *  differs from `activeModel` (the box's single active embed/imageEmbed model — a stale-space row is stale
 *  for every owner, so the purge is global). Returns the number of rows purged. The reindex half writes the
 *  new space FIRST (uniform `(…, model)` upsert keys, so the two spaces coexist), then this reclaims the old
 *  one — no row is ever stranded. Exhaustive over {@link VectorTable} (a new table fails tsc until its arm
 *  lands). Called in BULK mode only (a model change is a box-level event → a bulk reindex; a singular
 *  per-owner catch-up must not delete the global old space). */
export async function purgeStaleVectors(db: Db, table: VectorTable, activeModel: string): Promise<number> {
  switch (table) {
    case "character_embeddings": {
      const rows = await db.delete(characterEmbeddings).where(ne(characterEmbeddings.model, activeModel)).returning({ id: characterEmbeddings.id });
      return rows.length;
    }
    case "image_embeddings": {
      const rows = await db.delete(imageEmbeddings).where(ne(imageEmbeddings.model, activeModel)).returning({ id: imageEmbeddings.id });
      return rows.length;
    }
    case "chat_digests": {
      const rows = await db.delete(chatDigests).where(ne(chatDigests.model, activeModel)).returning({ id: chatDigests.id });
      return rows.length;
    }
    case "chat_segments": {
      const rows = await db.delete(chatSegments).where(ne(chatSegments.model, activeModel)).returning({ id: chatSegments.id });
      return rows.length;
    }
    default:
      return assertNever(table);
  }
}
