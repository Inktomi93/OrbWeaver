// domain/world-info/contract/import — the WorldInfoImportContext DI bundle + op type for the world-info-
// owned bulk-import write. A purpose-built context (not the full WorldInfoContext): the bulk path needs
// only db + clock + id minters, no audit/user-bus/chat guards (a bulk migration writes silently).

import type { AttachedBookRef } from "@orb/contracts/character";
import type { BulkImportLorebookInput, BulkImportLorebookResult, WorldBookRole } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import type { CharacterId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";

export interface WorldInfoImportContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newBookId: () => WorldBookId;
  readonly newEntryId: () => WorldEntryId;
}

/** Throws DomainNotFoundError when the target character isn't the caller's.
 *
 *  DESTRUCTIVE ON AN EXISTING PRIMARY (owner ruling 2026-09-05, #1598): the existing primary book is
 *  REPLACED in place (header update + full entry delete/reinsert), so this op is the RESTORE door's
 *  semantic — "the card file is the source of truth, put its book back" — never the plain re-upload's. A
 *  caller that may be re-uploading a card the owner already imported asks {@link HasPrimaryBook} first and
 *  skips this op when the seat is taken; the owner's edits win. */
export type BulkImportLorebook = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly book: BulkImportLorebookInput;
}) => Promise<BulkImportLorebookResult>;

/** Does this character already hold a PRIMARY book? The non-destructiveness oracle for a card re-upload
 *  (#1598): {@link BulkImportLorebook} REPLACES an existing primary's entries, which reverts the owner's
 *  edits to a book they have since curated, so the card-import verb consults this and skips the embedded-book
 *  plane when the seat is taken. Owner-scoped through the character (a character that is not the caller's
 *  answers `false` — it holds no primary the caller can see, and every write path gates ownership again). */
export type HasPrimaryBook = (args: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<boolean>;

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

// ── the character.duplicate CARRY ─────────────────────────────────────────

/** db + clock only: the carry copies character_books rows verbatim, no id-minting or audit. */
export interface WorldInfoDuplicateCarryContext {
  readonly db: Db;
  readonly now: () => number;
}

/** Re-points the source character's attached books at the new character id (fresh character_books rows,
 *  role preserved). REFERENCE-carry — the world_books themselves are never cloned; zero attachments = no-op.
 *  `ownerId` is the OWNED-SOURCE GATE, the same guard {@link LinkCarriedBooks} carries, at BOTH ends: both
 *  character ids must be the caller's or the carry copies nothing, AND only junction rows whose world_book is
 *  the caller's own cross (#1516 — a foreign book attached to an owned character is dropped silently, the
 *  `handoff-copy-write` posture). Without them the op is safe only because its one call site happens to have
 *  loaded the source owned first — a promise no signature carries to the next one. */
export type CopyCharacterBooks = (args: {
  readonly ownerId: UserId;
  readonly fromCharacterId: CharacterId;
  readonly toCharacterId: CharacterId;
}) => Promise<void>;

// ── the character IMPORT re-link ─────────────────────────────────────────────────────

/** linked/skipped counts for the import report — `skipped` counts references whose id has no book the
 *  importer OWNS on this install (absent or foreign — the cross-tenant-leak guard). */
export interface LinkCarriedBooksResult {
  readonly linked: number;
  readonly skipped: number;
}

/** Re-link a portable card's carried attached-book REFERENCES on import — the portability twin of
 *  {@link CopyCharacterBooks}. Each ref links ONLY when a book with that id EXISTS and is OWNED by `ownerId`
 *  (the owned-source gate — a carried id must never link a book the importer can't access); the rest skip
 *  and are reported. Fresh character_books rows, roles preserved, PK-collision-safe (onConflictDoNothing —
 *  a re-import onto an already-linked character is idempotent). Same context as the duplicate carry. */
export type LinkCarriedBooks = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly refs: readonly AttachedBookRef[];
}) => Promise<LinkCarriedBooksResult>;

// ── the ST NAME-LINK attach (card `extensions.world` + `world_info.charLore` extra books) ──────────

/** Attach the owner's EXISTING books to a character BY EXACT NAME — the ST name-link: a card's
 *  `extensions.world` names its primary lorebook and `world_info.charLore[].extraBooks` name auxiliaries,
 *  and both vocabularies are book NAMES (ids do not survive a cross-box move). Resolution uses the SAME
 *  owner-scoped (ownerId, name) key `ImportStandaloneLorebook` dedups on — exact match, newest-wins, never
 *  fuzzy (a dangling name is returned in `missing` for the report, the §5.7 unresolved-pin posture).
 *  `role` is the DESIRED role; a `primary` request DEMOTES to auxiliary when the character already holds a
 *  primary (the at-most-one-primary invariant — an embedded `character_book` import wins the seat). */
export type AttachOwnedBooksByName = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly names: readonly string[];
  readonly role: WorldBookRole;
}) => Promise<{ readonly linked: number; readonly missing: readonly string[] }>;
