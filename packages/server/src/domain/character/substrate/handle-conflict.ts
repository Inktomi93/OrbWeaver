// Is a thrown value the per-owner handle-uniqueness refusal? One home for the classification, so a caller outside
// this domain recovers from the refusal without re-spelling the error class and its code.

import { CHARACTER_HANDLE_CONFLICT, CharacterOperationError } from "../contract/errors.ts";

export function isCharacterHandleConflict(err: unknown): boolean {
  return err instanceof CharacterOperationError && err.code === CHARACTER_HANDLE_CONFLICT;
}
