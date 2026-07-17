// domain/world-info/contract/import — the WorldInfoImportContext DI bundle + op type for the world-info-
// owned bulk-import write. A purpose-built context (not the full WorldInfoContext): the bulk path needs
// only db + clock + id minters, no audit/user-bus/chat guards (a bulk migration writes silently).

import type { AttachedBookRef } from "@orb/contracts/character";
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

// ── the character.duplicate CARRY (PD-141) ─────────────────────────────────────────

/** db + clock only: the carry copies character_books rows verbatim, no id-minting or audit. */
export interface WorldInfoDuplicateCarryContext {
  readonly db: Db;
  readonly now: () => number;
}

/** Re-points the source character's attached books at the new character id (fresh character_books rows,
 *  role preserved). REFERENCE-carry — the world_books themselves are never cloned; zero attachments = no-op. */
export type CopyCharacterBooks = (args: { readonly fromCharacterId: CharacterId; readonly toCharacterId: CharacterId }) => Promise<void>;

// ── the character IMPORT re-link (PD-144) ──────────────────────────────────────────

/** linked/skipped counts for the import report — `skipped` counts references whose id has no book the
 *  importer OWNS on this install (absent or foreign — the cross-tenant-leak guard). */
export interface LinkCarriedBooksResult {
  readonly linked: number;
  readonly skipped: number;
}

/** PD-144: re-link a portable card's carried attached-book REFERENCES on import — the portability twin of
 *  {@link CopyCharacterBooks}. Each ref links ONLY when a book with that id EXISTS and is OWNED by `ownerId`
 *  (the owned-source gate — a carried id must never link a book the importer can't access); the rest skip
 *  and are reported. Fresh character_books rows, roles preserved, PK-collision-safe (onConflictDoNothing —
 *  a re-import onto an already-linked character is idempotent). Same context as the duplicate carry. */
export type LinkCarriedBooks = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly refs: readonly AttachedBookRef[];
}) => Promise<LinkCarriedBooksResult>;
