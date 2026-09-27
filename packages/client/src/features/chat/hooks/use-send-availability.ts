// `useSendAvailability` — the composer's honest-refusal pre-send gate (#54). Reads the chat's DETERMINISTIC
// serveability verdict (`chat.checkSendAvailability`) and resolves it to a disabled-with-reason the Send
// button + the guided fire actions share. ENGINE-AGNOSTIC: the reason copy adapts to the server's cause
// (no-connection / endpoint-unreachable / runtime-missing / …), but the gate is one boolean.
//
// Freshness: the verdict tracks a DETERMINISTIC-but-not-bus-driven fact (an engine being enabled or coming
// up, a connection being configured). It carries a modest `staleTime` (so it isn't re-fetched on every
// interaction) but NO background poll — a mounted-forever `refetchInterval` leaks its timer across the
// shared-page CT harness, and window-focus refetch fires spuriously under CT. The natural freshness drivers
// are enough: the query refetches on chat-open remount, and a stale verdict is at most `staleTime` old — a
// window in which the pre-existing provider error still catches a truly-doomed turn honestly.
//
// A DRAFT (null chatId) or an unresolved read is NEVER refused — the gate blocks ONLY on a resolved
// `available:false`. A draft's first send is what commits the chat; refusing before we know the verdict
// would break the happy path on every fresh chat.

import type { SendAvailability, UnavailableCause } from "@orb/contracts/inference";
import type { ChatId } from "@orb/kit/ids";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import { sendUnavailableReason } from "#lib";

/** Stale window for the verdict (ms) — long enough that it isn't re-fetched on every keystroke, short enough
 *  that a chat-reopen picks up an engine-enable / key-add. Not a bus-driven fact, so this is its freshness. */
const AVAILABILITY_STALE_MS = 15_000;

export interface SendGate {
  /** The chat cannot deterministically serve a turn — SEND + the guided fire actions disable. False while the
   *  verdict is unresolved or on a draft (never refuse before we know / before the first send commits). */
  readonly unavailable: boolean;
  /** The cause-specific disabled reason (title + aria) — present iff `unavailable`. */
  readonly reason: string | undefined;
  /** The settled verdict for readouts: `null` = serveable, a cause = refused, `undefined` = not settled. */
  readonly cause: UnavailableCause | null | undefined;
  /** The verdict read itself failed. The gate still never refuses on it; a readout names it. */
  readonly failed: boolean;
}

/** The pre-send serveability gate for `chatId` (null on a draft — never refused). */
export function useSendAvailability(chatId: ChatId | null): SendGate {
  const trpc = useTRPC();
  const { data, isError } = useQuery({
    ...trpc.chat.checkSendAvailability.queryOptions(chatId === null ? skipToken : { chatId }),
    staleTime: AVAILABILITY_STALE_MS,
  });
  // Pin the verdict to its contract type — the `skipToken`+spread `useQuery` inference can degrade `data` to
  // `any` in some type-graph states (a real strict-boolean-expressions fragility), so annotate deterministically.
  const verdict: SendAvailability | null | undefined = data;
  // No verdict yet ⇒ never refuse — the gate blocks ONLY on a resolved `available:false`. `!verdict` catches
  // both `undefined` (query in-flight) AND `null` (the tRPC no-data wire shape a CT stub yields).
  if (!verdict) {
    return { unavailable: false, reason: undefined, cause: undefined, failed: isError };
  }
  if (verdict.available) {
    return { unavailable: false, reason: undefined, cause: null, failed: false };
  }
  return { unavailable: true, reason: sendUnavailableReason(verdict.cause), cause: verdict.cause, failed: false };
}
