// db access for `embed_space_state` — the last COMPLETE `(model[@dtype])` space per `(owner, scope)`
// (inference program §10-5). Two statements and nothing else: read an owner's completion rows, and record
// one scope's completion.
//
// THE WRITE IS AN OVERWRITE, NEVER AN APPEND. Only the LATEST completed sweep is a true statement about
// where a scope's vectors are, so the upsert targets the `(owner, scope)` PK. History would be a second
// answer to a question that has one.
//
// This is a SEPARATE module from `queries.ts` on purpose: `queries.ts` is the store/hub-score write path's
// db access (vector rows), and nothing here touches a vector table.
//
// EMBEDDINGS IS THIS TABLE'S ONLY WRITER; the READER is `domain/search` (`persistence/active-space.ts`,
// which selects the rows itself because search may not import a domain). The fold from scope rows to a
// task's answer is NOT duplicated — it lives once in `@orb/contracts/embeddings` (`foldActiveSpace`).

import type { Db } from "@orb/db";
import { embedSpaceState } from "@orb/db";
import type { MarkSpaceCompleteInput } from "../contract/params.ts";

/** Record that `scope` is now COMPLETELY in `space` for this owner. Called only at a completed, non-aborted
 *  sweep terminal — a partial pass must never claim it. */
export async function upsertCompletedSpace(db: Db, input: MarkSpaceCompleteInput): Promise<void> {
  await db
    .insert(embedSpaceState)
    .values({ ownerId: input.ownerId, scope: input.scope, space: input.space, completedAt: input.now })
    .onConflictDoUpdate({
      target: [embedSpaceState.ownerId, embedSpaceState.scope],
      set: { space: input.space, completedAt: input.now },
    });
}
