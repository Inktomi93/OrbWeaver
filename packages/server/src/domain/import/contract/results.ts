// domain/import/contract/results — the verb result shapes.

import type { CharacterId, PersonaId } from "@orb/kit/ids";

export interface ImportedCharacterRef {
  readonly characterId: CharacterId;
}

/** created:false means an existing character already carried this importHash — nothing was written.
 *  PD-144: `attachedBooksLinked`/`attachedBooksSkipped` report the carried book-reference re-link — skipped
 *  counts references whose id had no book the importer owns on this install (absent/foreign), reported so a
 *  cross-install import surfaces the books that didn't travel. Both 0 for a card carrying no references. */
export interface ImportCharacterResult {
  readonly characterId: CharacterId;
  readonly created: boolean;
  readonly importHash: string;
  readonly attachedBooksLinked: number;
  readonly attachedBooksSkipped: number;
}

/** backfillEnqueued: whether the run enqueued a memory-backfill (only when ≥1 real_conversation chat was written). */
export interface ImportChatsResult {
  readonly characterId: CharacterId;
  readonly chatsImported: number;
  readonly chatsSkipped: number;
  readonly messagesImported: number;
  readonly variantsImported: number;
  readonly branchesLinked: number;
  readonly backfillEnqueued: boolean;
}

export interface ImportPersonasResult {
  readonly personasCreated: number;
  readonly personasSkipped: number;
  readonly defaultPersonaId: PersonaId | null;
}

/** `importChatFile` — never throws for a malformed/unmatched file; the refusal carries the operator-facing
 *  reason the calling door renders. `created:false` ⇒ the transcript deduped against an existing chat. */
export type ImportChatFileOutcome = { readonly ok: true; readonly created: boolean } | { readonly ok: false; readonly error: string };
