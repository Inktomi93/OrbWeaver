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

/** A filesystem/tooling failure (EACCES/EIO/ELOOP/…) while collecting a staged profile — NEVER the
 *  collector's documented "missing" (ENOENT) or "corrupt-format" (unparseable JSON) fallback (#763). Those
 *  two ARE best-effort by design (a profile legitimately may not carry `settings.json`, or ST may have
 *  written a truncated one); an infrastructure fault reading a file that DOES exist is not the same claim —
 *  folding it into the same "treat as absent" path produces an import that silently drops data and still
 *  reports success. Carries the affected `path` + `operation` (never just "collection failed") and the
 *  original fs error as `cause`. */
export class ImportInfraFailureError extends DomainOperationError {
  readonly path: string;
  readonly operation: string;
  constructor(operation: string, path: string, cause: unknown) {
    super("import_infra_failure", `${operation} failed for ${path}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = this.constructor.name;
    this.path = path;
    this.operation = operation;
    this.cause = cause;
  }
}
