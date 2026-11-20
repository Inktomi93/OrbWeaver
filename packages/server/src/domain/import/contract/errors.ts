// domain/import/contract/errors — the typed domain errors for the card-import slice. `ImportCardError` is
// the card-read/validate failure: a coded operational error (maps to BAD_REQUEST) extending the kit
// `DomainOperationError`. `code` discriminates `card_unreadable` (no ccv3/chara PNG chunk, malformed PNG,
// or undecodable JSON) from `card_invalid` (decoded, but the normalized card fails the canonical
// `createCharacterSchema`). The not-found path (`import-chats` into a missing character) is the chats
// wave — its `DomainNotFoundError` re-export lands with that verb, not in this card slice.

import type { CARD_REFUSAL_CODES } from "@orb/contracts/import";
import { DomainOperationError } from "@orb/kit/errors";
import { z } from "zod";

// The chats wave (`importChats` into a non-owned/missing character) throws the SHARED `DomainNotFoundError`
// (`@orb/kit/errors`) — the verb imports it from kit directly (the `noBarrelFile` gate forbids re-exporting it
// through this module; transport already discriminates the shared kit error, so no import-domain re-home is
// needed). This note is the pointer the spec's "re-export here" line intended.

export type ImportCardErrorCode = (typeof CARD_REFUSAL_CODES)[number];

/** The supplied bytes are not a readable/valid character card (see header for the `code` split). */
export class ImportCardError extends DomainOperationError {
  declare readonly code: ImportCardErrorCode;
  constructor(code: ImportCardErrorCode, message: string) {
    super(code, message);
    this.name = this.constructor.name;
  }
}

const PROFILE_IMPORT_LIMIT_ERROR_CODES = ["profile_file_too_large", "profile_total_too_large"] as const;
export type ProfileImportLimitErrorCode = (typeof PROFILE_IMPORT_LIMIT_ERROR_CODES)[number];

/** A direct profile-directory input breached its per-file or run-wide byte budget. */
export class ProfileImportLimitError extends DomainOperationError {
  constructor(code: ProfileImportLimitErrorCode, message: string) {
    super(code, message);
    this.name = this.constructor.name;
  }
}

/** A filesystem/tooling failure (EACCES/EIO/ELOOP/…) while collecting a staged profile — NEVER the
 *  collector's documented "missing" (ENOENT) or "corrupt-format" (unparseable JSON) fallback. Those
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

function failureText(error: unknown): string {
  // A raw schema error's own message is a JSON dump of its issues; the pretty form is the readable one.
  if (error instanceof z.ZodError) {
    return z.prettifyError(error);
  }
  return error instanceof Error ? error.message : String(error);
}

/** The fault a failed import item shows the person, on one line. A schema refusal prints its message and then the
 *  field it is at on an indented line of its own, so the last line alone would name a field and no fault. */
export function importFailureText(error: unknown): string {
  const message = failureText(error);
  const lines = message
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const last = lines.at(-1) ?? message;
  return last.startsWith("→") ? [lines.at(-2), last].filter((line) => line !== undefined).join(" ") : last;
}

/** The reason a failed card carries into the import report: {@link importFailureText}, led by the refusal code
 *  when the failure has one. */
export function importFailureReason(error: unknown): string {
  const fault = importFailureText(error);
  return error instanceof ImportCardError ? `${error.code}: ${fault}` : fault;
}
