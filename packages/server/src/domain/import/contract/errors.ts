// domain/import/contract/errors — the typed domain errors for the card-import slice. `ImportCardError` is
// the card-read/validate failure: a coded operational error (maps to BAD_REQUEST) extending the kit
// `DomainOperationError`. `code` discriminates `card_unreadable` (no ccv3/chara PNG chunk, malformed PNG,
// or undecodable JSON) from `card_invalid` (decoded, but the normalized card fails the canonical
// `createCharacterSchema`). The not-found path (`import-chats` into a missing character) is the chats
// wave — its `DomainNotFoundError` re-export lands with that verb, not in this card slice.

import { DomainOperationError } from "@orb/kit/errors";

// The chats wave (`importChats` into a non-owned/missing character) throws the SHARED `DomainNotFoundError`
// (`@orb/kit/errors`) — the verb imports it from kit directly (the `noBarrelFile` gate forbids re-exporting it
// through this module; transport already discriminates the shared kit error, so no import-domain re-home is
// needed). This note is the pointer the spec's "re-export here" line intended.

export type ImportCardErrorCode = "card_unreadable" | "card_invalid";

/** The supplied bytes are not a readable/valid character card (see header for the `code` split). */
export class ImportCardError extends DomainOperationError {
  constructor(code: ImportCardErrorCode, message: string) {
    super(code, message);
    this.name = this.constructor.name;
  }
}

export type ProfileImportLimitErrorCode = "profile_file_too_large" | "profile_total_too_large";

/** A direct profile-directory input breached its per-file or run-wide byte budget. */
export class ProfileImportLimitError extends DomainOperationError {
  constructor(code: ProfileImportLimitErrorCode, message: string) {
    super(code, message);
    this.name = this.constructor.name;
  }
}
