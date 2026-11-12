// primitives/stored-config — the ONE place that decides whether a stored versioned-config blob may be
// OVERWRITTEN, and the ONE home of the `stored_config_unreadable` wire code. Every versioned-config column
// (`user_settings.config`, the `APP_SETTINGS_KEY` override row, `presets.config`) is read through a parse
// seam that DEGRADES an unreadable blob to schema defaults. That degrade is correct for a read — a request
// renders defaults instead of 500ing — and catastrophic for a write: the write persists the stand-in and
// the user's real blob is gone, silently and permanently (the proven cause of a real settings wipe).
//
// LIVES IN `@orb/server/primitives`, NOT in a domain (not `domain/settings/substrate/`): two
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
// WHAT THE GUARD IS FOR, AND WHAT IT IS NOT (the boundary): it protects a write that DESCENDS FROM A
// READ of the row it is about to replace — the read-modify-write, including the round trip through a client
// that GETs a leniently-parsed blob and PUTs the whole thing back. A write whose content is INDEPENDENT of
// the stored blob (a packaged registry constant, the schema default a `reset` verb writes, an uploaded
// backup file) carries no degraded read to persist, and guarding it would refuse the user's own explicit
// repair while buying no protection. Each such writer states that reason
// at its own site; the exemption is permanent, not debt.
//
// TRADEOFF (deliberate): a user whose row is genuinely corrupt can no longer perform a read-modify-write
// against it until the row is repaired — the write fails loudly with `stored_config_unreadable` instead of
// quietly resetting everything. Losing write availability is recoverable; losing the blob is not.
//
// EXPORT: a newer build's blob exports as this build reads it; every other degraded read is defaults and never
// exports as the user's data. One such row never costs the rest of a library export: the row is reported through the
// caller's note sink, which the library zip writes to its export report and a single-item door turns into a refusal
// naming the row.

import type { PortableExportNotes } from "@orb/contracts/portability";
import type { VersionedParseFailure, VersionedParseOutcome } from "@orb/contracts/versioned-config";
import { VERSIONED_PARSE_FAILURES } from "@orb/contracts/versioned-config";
import { DomainOperationError } from "@orb/kit/errors";

/** The `DomainOperationError.code` this guard refuses with. ONE home — every domain catalog that lists it
 *  (`SETTINGS_OP_CODES.storedConfigUnreadable`) references this constant rather than re-spelling the wire
 *  string. */
export const STORED_CONFIG_UNREADABLE = "stored_config_unreadable";

/** Whether `error` is this guard's refusal of an unreadable stored blob. */
export function isStoredConfigUnreadable(error: unknown): error is DomainOperationError {
  return error instanceof DomainOperationError && error.code === STORED_CONFIG_UNREADABLE;
}

/** What a refusal declined to do with an unreadable blob. An export refuses for the same reason a write does: its
 *  stand-in is defaults, and a backup holding defaults presents them as the user's data. */
export const STORED_CONFIG_REFUSALS = { overwrite: "overwrite", export: "export" } as const;

export type StoredConfigRefusal = (typeof STORED_CONFIG_REFUSALS)[keyof typeof STORED_CONFIG_REFUSALS];

// The refusal of an unreadable stored blob. `what` names the row for the operator reading the error (a table + scope,
// never blob contents — the same leak-free posture as the settings audit metadata).
function unreadableStoredConfig(failure: VersionedParseFailure, what: string, refused: StoredConfigRefusal): DomainOperationError {
  return new DomainOperationError(
    STORED_CONFIG_UNREADABLE,
    `refusing to ${refused} ${what}: the stored blob could not be read (${failure}). The existing row is untouched.`,
  );
}

/** The stored blob, or {@link unreadableStoredConfig}'s refusal of `refused`. */
export function requireIntactStoredConfig<T>(outcome: VersionedParseOutcome<T>, what: string, refused: StoredConfigRefusal): T {
  if (!outcome.intact) {
    throw unreadableStoredConfig(outcome.failure, what, refused);
  }
  return outcome.value;
}

/** What an export may carry from a versioned blob: the value when the row was read, else the failure. */
export type ExportableStoredConfig<T> = { readonly carried: true; readonly value: T } | { readonly carried: false; readonly failure: VersionedParseFailure };

/** Whether a read that ended in `failure` (null when intact) still carries the user's data for an export. A newer build's
 *  blob exports as this build reads it, as it always has; every other stand-in is defaults, which an export must never
 *  present as the user's data. */
export function exportsStoredData(failure: VersionedParseFailure | null): boolean {
  return failure === null || failure === VERSIONED_PARSE_FAILURES.versionFromFuture;
}

/** {@link exportsStoredData} over a parse outcome. */
export function exportableStoredConfig<T>(outcome: VersionedParseOutcome<T>): ExportableStoredConfig<T> {
  if (outcome.intact || exportsStoredData(outcome.failure)) {
    return { carried: true, value: outcome.value };
  }
  return { carried: false, failure: outcome.failure };
}

/** The note sink of a single-item export door, which has nothing else to deliver: the first note refuses, naming the
 *  row. The owner repairs the row in its editor, whose save rewrites the stored blob, or deletes it. */
export const refuseExportNote: PortableExportNotes = (note) => {
  throw unreadableStoredConfig(note.failure, `the ${note.kind} "${note.item}"`, STORED_CONFIG_REFUSALS.export);
};

/** The note sink of a read that hashes an export's bytes for an import identity and delivers nothing to a person: a
 *  restore computes the identity over the same delivered bytes, so there is nothing to report. */
export const identityOnlyExportNote: PortableExportNotes = () => {
  // Nothing is delivered, so nothing is reported.
};
