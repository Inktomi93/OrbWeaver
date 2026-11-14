// domain/import/contract/identity — the card import-identity lookup shapes every door resolves through
// (`findImportedCharacter`, substrate/card). The identity itself is the serde's (`cardImportHash`).

import type { CharacterHandle, CharacterId, ChatId, UserId } from "@orb/kit/ids";

/** The by-hash read the lookup is given: the row carrying `importHash`, or null. A row is the owner's character,
 *  or whatever stands for one that a dry run has not written yet. */
export type FindCharacterByHash<Row = CharacterId> = (importHash: string) => Promise<Row | null>;

/** The owner's character `handle` names and the PNG card its current export writes; null when the handle names none
 *  of the owner's characters. A row the app wrote carries no stored key, so this is the lookup's last step (D290).
 *  SECURITY: the handle is file text; the op resolves it only among `ownerId`'s rows and re-proves ownership on the id. */
export type ExportCurrentCard = (args: {
  readonly ownerId: UserId;
  readonly handle: CharacterHandle;
}) => Promise<{ readonly characterId: CharacterId; readonly bytes: Uint8Array } | null>;

/** The current export bytes of each room the owner hosts that seats `characterId` and was created at `createdAt`:
 *  the rooms a chat bundle written from this library can be, compared by content (D290). */
export type ExportCurrentChats = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly createdAt: number;
}) => Promise<readonly { readonly chatId: ChatId; readonly bytes: Uint8Array }[]>;

/** The identity of the owned character a card's carried handle names, read off that row's current export, or null. */
export type CurrentCardIdentity<Row = CharacterId> = () => Promise<{ readonly characterId: Row; readonly hashes: CardIdentityHashes } | null>;

/** The three keys a card can be found under, in lookup order. */
export interface CardIdentityHashes {
  /** The full identity (`parsedCardImportHash`). */
  readonly importHash: string;
  /** The identity without the art (`parsedCardTextHash`) — what a JSON card of the same text hashes to. */
  readonly textHash: string;
  /** The whole-file hash (`importFileHash`) a row imported before the content identity carries. */
  readonly fileHash: string;
}

/** One seat of a restored chat: the handle it was exported under and, when the bundle carries it, the import
 *  identity of the card exported beside it. */
export interface RestoredSeat {
  readonly handle: string;
  readonly card: CardIdentityHashes | null;
}

// In lookup order: `findImportedCharacter` tries each key in this order.
const IMPORTED_CHARACTER_MATCHES = ["content", "text", "file", "current"] as const;

/** How a found character matched: its full identity, its text alone (the row landed from a JSON card and this
 *  is its PNG — only a candidate; the caller decides whether the row may take the art), the whole-file
 *  hash a row imported before the content identity carries, or the current identity of the row the card's
 *  carried handle names (a row the app wrote, which carries no stored key). */
export type ImportedCharacterMatch = (typeof IMPORTED_CHARACTER_MATCHES)[number];
