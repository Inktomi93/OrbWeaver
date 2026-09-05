// kit/stored-config — the ONE place that decides whether a stored versioned-config blob may be
// OVERWRITTEN, and the ONE home of the `stored_config_unreadable` wire code. Every versioned-config column
// (`user_settings.config`, the `APP_SETTINGS_KEY` override row, `presets.config`) is read through a parse
// seam that DEGRADES an unreadable blob to schema defaults. That degrade is correct for a read — a request
// renders defaults instead of 500ing — and catastrophic for a write: the write persists the stand-in and
// the user's real blob is gone, silently and permanently (#471; the proven cause of the #461 wipe).
//
// LIVES IN `@orb/server/kit`, NOT in a domain (moved out of `domain/settings/substrate/` by #1026): two
// domains now need it and a domain→domain VALUE import is dep-cruiser RED (`domain-no-cross-feature`;
// type-only is the only exemption). `@orb/kit` cannot host it — it takes a `@orb/contracts` shape and kit
// sits below contracts — so the server-only-pure tier is the one home both settings and preset reach
// DOWNWARD into.
//
// The three read outcomes a write path must distinguish, and what each means:
//   absent      — no row yet. A first write is LEGITIMATE; the caller starts from the schema default.
//   intact      — the stored blob parsed. Normal read-modify-write.
//   degraded    — a row EXISTS and could not be read. The write REFUSES. Re-reading cannot help (the bytes
//                 are what they are), so refusing is the only arm that preserves the data.
//
// WHAT THE GUARD IS FOR, AND WHAT IT IS NOT (the #1026 boundary): it protects a write that DESCENDS FROM A
// READ of the row it is about to replace — the read-modify-write, including the round trip through a client
// that GETs a leniently-parsed blob and PUTs the whole thing back. A write whose content is INDEPENDENT of
// the stored blob (a packaged registry constant, the schema default a `reset` verb writes, an uploaded
// backup file) carries no degraded read to persist, and guarding it would refuse the user's own explicit
// repair while buying no protection. Those writers are named, with their reasons, in the
// `json-column-write-parity` gate's GUARD_EXEMPT table — a permanent two-sided exemption, not debt.
//
// TRADEOFF (deliberate): a user whose row is genuinely corrupt can no longer perform a read-modify-write
// against it until the row is repaired — the write fails loudly with `stored_config_unreadable` instead of
// quietly resetting everything. Losing write availability is recoverable; losing the blob is not.

import type { VersionedParseOutcome } from "@orb/contracts/versioned-config";
import { DomainOperationError } from "@orb/kit/errors";

/** The `DomainOperationError.code` this guard refuses with. ONE home — every domain catalog that lists it
 *  (`SETTINGS_OP_CODES.storedConfigUnreadable`) references this constant rather than re-spelling the wire
 *  string. */
export const STORED_CONFIG_UNREADABLE = "stored_config_unreadable";

/**
 * The stored blob, or a refusal. `what` names the row for the operator reading the error (a table +
 * scope, never blob contents — the same leak-free posture as the settings audit metadata).
 */
export function requireIntactStoredConfig<T>(outcome: VersionedParseOutcome<T>, what: string): T {
  if (!outcome.intact) {
    throw new DomainOperationError(
      STORED_CONFIG_UNREADABLE,
      `refusing to overwrite ${what}: the stored blob could not be read (${outcome.failure}). The existing row is untouched.`,
    );
  }
  return outcome.value;
}
