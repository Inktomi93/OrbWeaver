// `useSendAvailability` — the composer's honest-refusal pre-send gate (#54). Reads the chat's DETERMINISTIC
// serveability verdict (`chat.checkSendAvailability`) and resolves it to a disabled-with-reason the Send
// button + the guided fire actions share. ENGINE-AGNOSTIC: the reason copy adapts to the server's cause
// (engine-off / no-connection / generic), but the gate is one boolean.
//
// Freshness: the verdict tracks a DETERMINISTIC-but-not-bus-driven fact (an engine being enabled, a
// connection being configured) — the SSE bus never ticks on it, so unlike the Infinity-staleTime chat reads
// this query carries its OWN modest refetch so an owner who enables the engine (or adds a key) sees the gate
// CLEAR without a reload. A short staleTime + a background poll: rare, cheap, and the verdict is a tiny bool.
//
// A DRAFT (null chatId) or an unresolved read is NEVER refused — the gate blocks ONLY on a resolved
// `available:false`. A draft's first send is what commits the chat; refusing before we know the verdict
// would break the happy path on every fresh chat.

import type { ChatId } from "@orb/kit/ids";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import { sendUnavailableReason } from "#lib";

/** Poll the deterministic verdict on a modest cadence so an engine-enable / key-add clears the gate live —
 *  the fact isn't bus-driven, so this is its only freshness driver. Long enough to be negligible. */
const AVAILABILITY_POLL_MS = 15_000;

export interface SendAvailability {
  /** The chat cannot deterministically serve a turn — SEND + the guided fire actions disable. False while the
   *  verdict is unresolved or on a draft (never refuse before we know / before the first send commits). */
  readonly unavailable: boolean;
  /** The cause-specific disabled reason (title + aria) — present iff `unavailable`. */
  readonly reason: string | undefined;
}

/** The pre-send serveability gate for `chatId` (null on a draft — never refused). */
export function useSendAvailability(chatId: ChatId | null): SendAvailability {
  const trpc = useTRPC();
  const { data } = useQuery({
    ...trpc.chat.checkSendAvailability.queryOptions(chatId === null ? skipToken : { chatId }),
    staleTime: AVAILABILITY_POLL_MS,
    refetchInterval: AVAILABILITY_POLL_MS,
  });
  // No verdict yet (query unresolved) ⇒ never refuse — the gate blocks ONLY on a resolved `available:false`.
  if (!data || data.available) {
    return { unavailable: false, reason: undefined };
  }
  return { unavailable: true, reason: sendUnavailableReason(data.cause) };
}
