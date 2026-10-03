// domain/import/contract/identity — the card import-identity lookup shapes every door resolves through
// (`findImportedCharacter`, substrate/card). The identity itself is the serde's (`cardImportHash`).

import type { CharacterId } from "@orb/kit/ids";

/** The by-hash read the lookup is given: the owner's character carrying `importHash`, or null. */
export type FindCharacterByHash = (importHash: string) => Promise<CharacterId | null>;

/** The three keys a card can be found under, in lookup order. */
export interface CardIdentityHashes {
  /** The full identity (`parsedCardImportHash`). */
  readonly importHash: string;
  /** The identity without the art (`parsedCardTextHash`) — what a JSON card of the same text hashes to. */
  readonly textHash: string;
  /** The file bytes, for the whole-file hash a row imported before the content identity carries. */
  readonly bytes: Uint8Array;
}

// In lookup order: `findImportedCharacter` tries each key in this order.
const IMPORTED_CHARACTER_MATCHES = ["content", "text", "file"] as const;

/** How a found character matched: its full identity, its text alone (the row landed from a JSON card and this
 *  is its PNG — only a candidate; the caller decides whether the row may take the art), or the whole-file
 *  hash a row imported before the content identity carries. */
export type ImportedCharacterMatch = (typeof IMPORTED_CHARACTER_MATCHES)[number];
