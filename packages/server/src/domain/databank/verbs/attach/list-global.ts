// verb: listGlobal — WHICH of the caller's documents are global, as an id SET (databank-surface-spec.md
// D-1, ruled IN). The `worldInfo.listGlobal` twin, with one deliberate shape difference: world-info returns
// full `BookAttachmentView[]` because its consumer is an attachment PANEL, whereas this one's consumer is
// the library row's `Everywhere` toggle — a membership TEST against a list the surface has already fetched.
// Returning views would ship the same rows twice on one pane render, so the payload is the ids alone.
//
// The alternative the spec REJECTS (and this verb exists to kill): one `listAttachments` per rendered row —
// legacy's N+1 (40 documents = 40 round-trips to paint one pane).
//
// Owner-scoped in the WHERE via `global_documents.ownerId`, which IS the scope subject (D23) — the junction
// carries the owner, so this needs no join back to `documents`. A read: no audit.

import type { DatabankContext, DatabankService } from "../../contract/service.ts";
import { listGlobalDocumentIds } from "../../persistence/queries.ts";

export function createListGlobal(ctx: DatabankContext): DatabankService["listGlobal"] {
  return ({ principal }) => listGlobalDocumentIds(ctx.db, principal.userId);
}
