// domain/databank/contract/portability — the THREE portability ops of the document library, in ONE contract
// file because they share one DI bundle and one dedup rule. Databank was born AFTER the portability spec
// froze its kind list, so a full-account backup silently lost the whole library (F1, P1) until these landed.
//
//   • `ListOwnedDocumentIds` + `ExportDocument` — the bundle descriptor's export half, deliberately SPLIT:
//     `extractedText` IS the canon and one document can be megabytes, so the descriptor streams one file at
//     a time instead of materializing the library (the world-info book precedent).
//   • `ImportDocument` — the import half. Never throws for a malformed file.
//
// THE DEDUP RULE (one home): `(ownerId, importHash)` — the same unique index the re-upload path dedups on.
// A re-imported document is not re-written; its ATTACHMENTS are still (re)asserted, so a bundle whose
// document already existed still restores the scopes it was attached under.

import type { Db } from "@orb/db";
import type { DocumentId, UserId, WorkloadId } from "@orb/kit/ids";

/** The DI bundle every databank portability op closes over (assembled at the entry composition root).
 *  Principal-less by design: the delivery core knows only `ownerId`, so these are standalone factories, not
 *  `DatabankService` verbs. */
export interface DatabankPortabilityContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newDocumentId: () => DocumentId;
  /** Re-runs the DERIVED layer for a restored document. Nothing derived travels in a bundle (chunks +
   *  embeddings are re-runnable by construction), so a restored document is retrieval-dead until this runs. */
  readonly enqueueIngest: (args: { readonly documentId: DocumentId; readonly ownerId: UserId }) => Promise<{ readonly workloadId: WorkloadId }>;
}

/** One portable document file: its `filename` (relative — the descriptor prefixes the bundle `dir`) and the
 *  serialized bytes. */
export interface ExportedDocumentFile {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/** Every document the owner owns — the enumeration the descriptor's `exportAll` streams over. */
export type ListOwnedDocumentIds = (args: { readonly ownerId: UserId }) => Promise<readonly DocumentId[]>;

/** Export ONE owned document (+ its re-linkable scopes) as a portable file, or null when the document is
 *  not the caller's (or absent) — the leak-free posture of every owner-scoped databank read. */
export type ExportDocument = (args: { readonly ownerId: UserId; readonly documentId: DocumentId }) => Promise<ExportedDocumentFile | null>;

/** `created:false` ⇒ the file deduped against an existing document (idempotent re-import). A refusal
 *  carries the operator-facing reason the calling door renders. */
export type DatabankImportOutcome = { readonly ok: true; readonly created: boolean } | { readonly ok: false; readonly error: string };

/** Import ONE `databank/*.json` into the owner's library. Never throws for a malformed file. */
export type ImportDocument = (args: { readonly ownerId: UserId; readonly bytes: Uint8Array }) => Promise<DatabankImportOutcome>;
