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
import { useSendAvailabilityRead, useTRPC } from "#data";
import { sendUnavailableReason } from "#lib";
import { sendRefusalKey } from "../lib/next-turn-line.ts";
import { useCreditConnections } from "./use-credit-connections.ts";

/** Unresolved reads do not refuse a send; a resolved refusal always carries its reason and cause. */
export type SendGate =
  | { readonly unavailable: false; readonly reason: undefined; readonly cause: undefined; readonly failed: boolean }
  | { readonly unavailable: false; readonly reason: undefined; readonly cause: null; readonly failed: false }
  | { readonly unavailable: true; readonly reason: string; readonly cause: UnavailableCause; readonly failed: false };

/** The normalized refusal projected to controls without inventing a query outcome. */
export type SendRefusal =
  | Pick<Extract<SendGate, { readonly unavailable: false }>, "unavailable" | "reason">
  | Pick<Extract<SendGate, { readonly unavailable: true }>, "unavailable" | "reason">;

/** The pre-send serveability gate for `chatId` (null on a draft — never refused). */
export function useSendAvailability(chatId: ChatId | null): SendGate {
  const trpc = useTRPC();
  const { data, isError } = useSendAvailabilityRead(chatId);
  // Pin the verdict to its contract type — the `skipToken`+spread `useQuery` inference can degrade `data` to
  // `any` in some type-graph states (a real strict-boolean-expressions fragility), so annotate deterministically.
  const verdict: SendAvailability | null | undefined = data;
  // The reason names the fix the next-turn line's door opens, so it reads the same room and connection list.
  const chat = useQuery(trpc.chat.getChat.queryOptions(chatId === null ? skipToken : { chatId }));
  const viewerIsHost = chat.data?.viewerIsHost ?? undefined;
  const connections = useCreditConnections();
  // No verdict yet ⇒ never refuse — the gate blocks ONLY on a resolved `available:false`. `!verdict` catches
  // both `undefined` (query in-flight) AND `null` (the tRPC no-data wire shape a CT stub yields).
  if (!verdict) {
    return { unavailable: false, reason: undefined, cause: undefined, failed: isError };
  }
  if (verdict.available) {
    return { unavailable: false, reason: undefined, cause: null, failed: false };
  }
  const reason = sendUnavailableReason(sendRefusalKey(verdict.cause, viewerIsHost, connections));
  return { unavailable: true, reason, cause: verdict.cause, failed: false };
}
