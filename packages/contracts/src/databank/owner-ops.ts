// Shared owner data and injected operations; implementations and authority resolution stay in server domains.

import type { DocumentId, UserId } from "@orb/kit/ids";

/** Capture the rooms a document reaches before junction teardown; call the thunk only after the owner-scoped write succeeds. */
export type CaptureDatabankRoomReachOp = (documentId: DocumentId) => Promise<() => void>;

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
