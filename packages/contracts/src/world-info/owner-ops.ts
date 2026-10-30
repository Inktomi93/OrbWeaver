// World-info owner operations other domains inject; the world-info domain implements them and the composition root wires them.

import type { CharacterId, ChatId, UserId, WorldBookId } from "@orb/kit/ids";
import type { PortableFile } from "#portability";
import type { AttachedBookRef } from "../character/index.ts";
import type { HandoffCardPair } from "../chat/handoff-context.ts";
import type { BulkImportLorebookInput, BulkImportLorebookResult, WorldBookRole } from "./schemas.ts";

/** Throws DomainNotFoundError when the target character isn't the caller's.
 *
 *  Destructive on an existing primary: the existing primary book is replaced in place (header update and full
 *  entry delete/reinsert), so this op is the restore door's semantic, never the plain re-upload's. A caller that
 *  may be re-uploading a card the owner already imported asks {@link HasPrimaryBook} first and skips this op
 *  when the seat is taken; the owner's edits win. */
export type BulkImportLorebook = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly book: BulkImportLorebookInput;
}) => Promise<BulkImportLorebookResult>;

/** Does this character already hold a primary book? The non-destructiveness oracle for a card re-upload:
 *  {@link BulkImportLorebook} replaces an existing primary's entries, which reverts the owner's edits, so the
 *  card-import verb consults this and skips the embedded-book plane when the seat is taken. A character that is
 *  not the caller's answers `false`. */
export type HasPrimaryBook = (args: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<boolean>;

/** Lands a lone book with no character attach, additively: equal content under the same name reuses the owned
 *  row; different content lands as a fresh book under the next free name. Never edits an owned book. */
export type ImportStandaloneLorebook = (args: { readonly ownerId: UserId; readonly book: BulkImportLorebookInput }) => Promise<BulkImportLorebookResult>;

/** Re-points the source character's attached books at the new character id (fresh character_books rows, role
 *  preserved). Reference-carry: the world_books themselves are never cloned; zero attachments is a no-op.
 *  `ownerId` is the owned-source gate at both ends: both character ids must be the caller's or the carry copies
 *  nothing, and only junction rows whose world_book is the caller's own cross. */
export type CopyCharacterBooks = (args: {
  readonly ownerId: UserId;
  readonly fromCharacterId: CharacterId;
  readonly toCharacterId: CharacterId;
}) => Promise<void>;

/** linked/skipped counts for the import report; `skipped` counts references whose id has no book the importer
 *  owns on this install (absent or foreign). */
export interface LinkCarriedBooksResult {
  readonly linked: number;
  readonly skipped: number;
}

/** Re-link a portable card's carried attached-book references on import, the portability twin of
 *  {@link CopyCharacterBooks}. Each ref links only when a book with that id exists and is owned by `ownerId`;
 *  the rest skip and are reported. Fresh character_books rows, roles preserved, idempotent on a re-import. */
export type LinkCarriedBooks = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly refs: readonly AttachedBookRef[];
}) => Promise<LinkCarriedBooksResult>;

/** Attach the owner's books to a character by name, the SillyTavern name-link: a card's `extensions.world`
 *  names its primary lorebook and `world_info.charLore[].extraBooks` name auxiliaries. A name the same import's
 *  worlds wave landed binds that row through `landed`. Any other name resolves by exact owned name,
 *  newest-wins, never fuzzy; a dangling name is returned in `missing`. `role` is the desired role; a `primary`
 *  request demotes to auxiliary when the character already holds a primary. */
export type AttachOwnedBooksByName = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly names: readonly string[];
  readonly role: WorldBookRole;
  /** The books this import's worlds wave landed, keyed by the name the profile calls each one. */
  readonly landed: ReadonlyMap<string, WorldBookId>;
}) => Promise<{ readonly linked: number; readonly missing: readonly string[] }>;

/** A composition able to replace an embedded book also receives its edited-primary refusal oracle. */
export interface ImportWorldInfoPort {
  readonly importLorebook: BulkImportLorebook;
  readonly hasPrimaryBook: HasPrimaryBook;
  readonly linkCarriedBooks: LinkCarriedBooks;
}

/** Export one owned book (and its entries) as the portable `worlds/*.json` file, or null when the book is not
 *  the caller's or is absent. */
export type ExportWorldBook = (args: { readonly ownerId: UserId; readonly bookId: WorldBookId }) => Promise<PortableFile | null>;

/** Every book the owner owns, the enumeration the bundle descriptor's `exportAll` streams over. */
export type ListOwnedBookIds = (args: { readonly ownerId: UserId }) => Promise<readonly WorldBookId[]>;

/** The host-handoff lore copy takes these args. The copy returns unexecuted statements, so its signature stays
 *  with each consuming domain. */
export interface CopyHandoffBooksArgs {
  readonly fromOwnerId: UserId;
  readonly toOwnerId: UserId;
  readonly chatId: ChatId;
  readonly cardCopies: readonly HandoffCardPair[];
}

/** How many distinct books the handoff lore copy would mint for `toOwnerId`. Read-only; `characterIds` are the
 *  source cards the offer would copy. */
export type CountHandoffBooks = (args: {
  readonly fromOwnerId: UserId;
  readonly toOwnerId: UserId;
  readonly chatId: ChatId;
  readonly characterIds: readonly CharacterId[];
}) => Promise<number>;
