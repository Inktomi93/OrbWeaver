// substrate/stored-config — the ONE place that decides whether a stored versioned-config blob may be
// OVERWRITTEN. Both settings blobs are read-modify-written (`user_settings.config`,
// the `APP_SETTINGS_KEY` override row) and both read through a parse seam that DEGRADES an unreadable blob
// to schema defaults. That degrade is correct for a read — a request renders defaults instead of 500ing —
// and catastrophic for a write: the write persists the stand-in and the user's real settings are gone,
// silently and permanently (#471; the proven cause of the #461 blob wipe).
//
// The three read outcomes a write path must distinguish, and what each means:
//   absent      — no row yet. A first write is LEGITIMATE; the caller starts from the schema default.
//   intact      — the stored blob parsed. Normal read-modify-write.
//   degraded    — a row EXISTS and could not be read. The write REFUSES. Re-reading cannot help (the bytes
//                 are what they are), so refusing is the only arm that preserves the data.
//
// TRADEOFF (deliberate): a user whose row is genuinely corrupt can no longer write settings until the row
// is repaired — settings writes fail loudly with `stored_config_unreadable` instead of quietly resetting
// everything. Losing write availability is recoverable; losing the blob is not.

import type { VersionedParseOutcome } from "@orb/contracts/versioned-config";
import { DomainOperationError } from "@orb/kit/errors";
import { SETTINGS_OP_CODES } from "../contract/errors.ts";

/**
 * The stored blob, or a refusal. `what` names the row for the operator reading the error (a table +
 * scope, never blob contents — the same leak-free posture as the settings audit metadata).
 */
export function requireIntactStoredConfig<T>(outcome: VersionedParseOutcome<T>, what: string): T {
  if (!outcome.intact) {
    throw new DomainOperationError(
      SETTINGS_OP_CODES.storedConfigUnreadable,
      `refusing to overwrite ${what}: the stored blob could not be read (${outcome.failure}). The existing row is untouched.`,
    );
  }
  return outcome.value;
}
