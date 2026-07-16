// domain/world-info/contract/import — the WorldInfoImportContext DI bundle + op type for the world-info-
// owned bulk-import write. A purpose-built context (not the full WorldInfoContext): the bulk path needs
// only db + clock + id minters, no audit/user-bus/chat guards (a bulk migration writes silently).

import type { BulkImportLorebookInput, BulkImportLorebookResult } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import type { CharacterId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";

export interface WorldInfoImportContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newBookId: () => WorldBookId;
  readonly newEntryId: () => WorldEntryId;
}

/** Throws DomainNotFoundError when the target character isn't the caller's. */
export type BulkImportLorebook = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly book: BulkImportLorebookInput;
}) => Promise<BulkImportLorebookResult>;

// ── the STANDALONE (unattached) path — the worlds/*.json portability lane ──────────

/** Lands a lone book with NO character attach; dedupes on (ownerId, name): existing book edited in place,
 *  otherwise a fresh unattached book is created. */
export type ImportStandaloneLorebook = (args: { readonly ownerId: UserId; readonly book: BulkImportLorebookInput }) => Promise<BulkImportLorebookResult>;

export interface ImportWorldBookContext {
  readonly importStandalone: ImportStandaloneLorebook;
}

/** ok:false + error for a malformed upload (never thrown); created:false when a same-named book was replaced. */
export interface ImportWorldBookOutcome {
  readonly ok: boolean;
  readonly created?: boolean;
  readonly error?: string;
}

/** Never throws for a malformed file — returns \{ ok:false, error \}. */
export type ImportWorldBook = (args: { readonly ownerId: UserId; readonly bytes: Uint8Array }) => Promise<ImportWorldBookOutcome>;
