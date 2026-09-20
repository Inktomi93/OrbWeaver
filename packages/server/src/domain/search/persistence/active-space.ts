// The retrieval side's read of `embed_space_state` — which `(model[@dtype])` space each half of this
// owner's corpus has COMPLETELY settled into (inference program §10-5).
//
// A CROSS-DOMAIN TABLE READ FROM `persistence/`, which is the sanctioned home for exactly that: the table
// belongs to `domain/embeddings` (the only writer — `persistence/space-state.ts`), and search may not import
// a sibling domain, so it reads the rows itself here, exactly as `nearest.ts` reads databank's `documents`
// to derive owner scope. The one thing that must NOT be duplicated is the FOLD from scope rows to a task's
// answer, and it is not: both sides call `foldActiveSpace` in `@orb/contracts/embeddings`.
//
// `ReadOnlyDb` by construction (search's whole context is), so this cannot become a second writer.

import type { CompletedSpaceRow } from "@orb/contracts/embeddings";
import type { ReadOnlyDb } from "@orb/db";
import { embedSpaceState } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

/** Every scope this owner has completed a sweep for, with the space that sweep left it in. */
export function readCompletedSpaces(db: ReadOnlyDb, ownerId: UserId): Promise<CompletedSpaceRow[]> {
  return db.select({ scope: embedSpaceState.scope, space: embedSpaceState.space }).from(embedSpaceState).where(eq(embedSpaceState.ownerId, ownerId));
}
