// The Share card's view-model: the share preconditions as rows, the start refusal each row owns, and the
// memory that notices a relay coming back under a new URL. Pure, so every verdict is unit-proved.

import type { AuthMode, RelayBinaryRefusal, RelayStatus, ShareRefusal, ShareState } from "@orb/contracts/identity";
import { RELAY_BINARY_REFUSALS, SHARE_REFUSALS } from "@orb/contracts/identity";
import { trpcErrorReason } from "#lib";

/** The rows the card shows before a share starts, in the order the server checks them. */
export const SHARE_PRECONDITIONS = ["mode", "owner", "seating", "relay"] as const;
type SharePrecondition = (typeof SHARE_PRECONDITIONS)[number];

/**
 * A row's verdict. `unmet` is known now and its fix comes first; `waiting` hangs on an earlier row; `unchecked`
 * is decided by the server at start; `refused` is the server's answer to the last start, which a new start
 * re-checks.
 */
export const PRECONDITION_VERDICTS = ["met", "unmet", "waiting", "unchecked", "refused"] as const;
type PreconditionVerdict = (typeof PRECONDITION_VERDICTS)[number];

/** Whether a verdict holds the Start button until its fix is done. */
export const VERDICT_BLOCKS_START: Record<PreconditionVerdict, boolean> = {
  met: false,
  unmet: true,
  waiting: true,
  unchecked: false,
  refused: false,
};

// A `share.start` refusal the card can explain: a precondition, or the relay binary.
type ShareStartRefusal = ShareRefusal | RelayBinaryRefusal;

/** The coded refusal off a failed `share.start`, with the server's sentence, which names the fix. */
export interface ShareStartFailure {
  readonly code: ShareStartRefusal;
  readonly message: string;
}

/** The facts the rows read: the boot-fixed sign-in mode, the two seating settings and the last start refusal. */
export interface ShareFactsView {
  readonly mode: AuthMode;
  readonly localMultiUser: boolean;
  readonly discreetLogin: boolean;
  readonly refusal: ShareStartRefusal | null;
}

export interface PreconditionRow {
  readonly id: SharePrecondition;
  readonly verdict: PreconditionVerdict;
}

// A relayed visitor is never the owner, so single-user refuses everyone; forward-header would trust the loopback
// relay to name the user. Mapped over every mode so a new one fails tsc.
const MODE_VERDICT: Record<AuthMode, "met" | "unmet"> = {
  "single-user": "unmet",
  "forward-header": "unmet",
  local: "met",
  oidc: "met",
};

/** The row that shows a refusal's sentence. The two mode refusals repeat what the mode row already knows. */
export function refusalRow(code: ShareStartRefusal): SharePrecondition {
  switch (code) {
    case "share_single_user":
    case "share_forward_header":
      return "mode";
    case "share_owner_unclaimed":
      return "owner";
    case "share_in_container":
    case "relay_platform_unsupported":
    case "relay_binary_download_failed":
    case "relay_binary_checksum_mismatch":
      return "relay";
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

function ownerVerdict(facts: ShareFactsView): PreconditionVerdict {
  if (MODE_VERDICT[facts.mode] === "unmet") {
    return "waiting";
  }
  // A signed-in owner under `local` signed in with the owner password, so it is claimed unless the server said
  // otherwise; `oidc` has no owner password at all.
  return facts.refusal === "share_owner_unclaimed" ? "refused" : "met";
}

function seatingVerdict(facts: ShareFactsView): PreconditionVerdict {
  // Under oidc every signed-in person may be seated and the sign-in page is the identity provider's.
  if (facts.mode === "oidc") {
    return "met";
  }
  return facts.localMultiUser && facts.discreetLogin ? "met" : "unmet";
}

function relayVerdict(facts: ShareFactsView): PreconditionVerdict {
  return facts.refusal !== null && refusalRow(facts.refusal) === "relay" ? "refused" : "unchecked";
}

/** Every precondition row, in {@link SHARE_PRECONDITIONS} order. */
export function sharePreconditions(facts: ShareFactsView): readonly PreconditionRow[] {
  const verdicts: Record<SharePrecondition, PreconditionVerdict> = {
    mode: MODE_VERDICT[facts.mode],
    owner: ownerVerdict(facts),
    seating: seatingVerdict(facts),
    relay: relayVerdict(facts),
  };
  return SHARE_PRECONDITIONS.map((id) => ({ id, verdict: verdicts[id] }));
}

/** True when no row holds the Start button. */
export function canStartSharing(rows: readonly PreconditionRow[]): boolean {
  return rows.every((row) => !VERDICT_BLOCKS_START[row.verdict]);
}

function isShareStartRefusal(reason: string): reason is ShareStartRefusal {
  return (SHARE_REFUSALS as readonly string[]).includes(reason) || (RELAY_BINARY_REFUSALS as readonly string[]).includes(reason);
}

/** The coded refusal off a `share.start` error, or null for any other failure (which the toast reports). */
export function shareStartFailure(error: unknown): ShareStartFailure | null {
  const reason = trpcErrorReason(error);
  if (!isShareStartRefusal(reason)) {
    return null;
  }
  return { code: reason, message: error instanceof Error ? error.message : "" };
}

/** The last URL the relay was up at, and the change the owner has not dismissed yet. */
export interface ShareLinkMemory {
  readonly lastUrl: string | null;
  readonly changed: { readonly from: string; readonly to: string } | null;
}

export const EMPTY_SHARE_LINK_MEMORY: ShareLinkMemory = { lastUrl: null, changed: null };

/**
 * Folds one status read into the memory. Returns the same object when nothing changed, so a caller may set state
 * during render on identity. A relay that comes back up under another URL is a change, whatever happened between:
 * a restart, a stop and start, or a death.
 */
export function rememberShareLink(memory: ShareLinkMemory, relay: RelayStatus): ShareLinkMemory {
  if (relay.state !== "up" || relay.url === memory.lastUrl) {
    return memory;
  }
  if (memory.lastUrl === null) {
    return { lastUrl: relay.url, changed: memory.changed };
  }
  return { lastUrl: relay.url, changed: { from: memory.lastUrl, to: relay.url } };
}

/** The memory with the change notice dismissed. */
export function dismissLinkChange(memory: ShareLinkMemory): ShareLinkMemory {
  return memory.changed === null ? memory : { lastUrl: memory.lastUrl, changed: null };
}

// How often each state is read again: a transition fast, a live relay for its socket count, a settled one slowly.
const SETTLED_POLL_MS = 10_000;
const LIVE_POLL_MS = 5000;
const TRANSITION_POLL_MS = 1000;

const POLL_MS: Record<ShareState, (relay: RelayStatus) => number> = {
  off: () => SETTLED_POLL_MS,
  starting: () => TRANSITION_POLL_MS,
  up: () => LIVE_POLL_MS,
  down: (relay) => (relay.state === "down" && relay.restarting ? TRANSITION_POLL_MS : SETTLED_POLL_MS),
};

/** The `share.status` poll interval for the current state. */
export function sharePollMs(relay: RelayStatus): number {
  return POLL_MS[relay.state](relay);
}
