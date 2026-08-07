// The recorded-turn window, indexed by producing variant (TOOLCALLS-INVISIBLE, arm A).
//
// ONE QUERY PER ROOM, NOT PER ROW. The disclosure mounts on every committed assistant row, so a per-row query
// would be a query storm against a surface most people never open. The server read is chat-scoped and returns
// a window; this indexes it once and every row does a Map lookup.
//
// SWIPE-CORRECT WITH NO REFETCH: the index is keyed by `variantId` and the row looks up its OWN
// `selectedVariantId`, so swiping re-targets an entry the client already holds.

import type { RpgRecordedToolCall } from "@orb/contracts/rpg";
import type { ChatId, MessageVariantId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";

/** How deep a scrollback the disclosure can answer for. Matches the server verb's own default — a deeper
 *  history would need both raised, which is the point of them being the same number. */
const TURN_TOOL_CALLS_WINDOW = 50;

/** The empty index, hoisted so a room with no records hands every row the SAME Map instance (a fresh `new
 *  Map()` per render would be a new identity on every render for every row). */
const EMPTY_INDEX: ReadonlyMap<MessageVariantId, readonly RpgRecordedToolCall[]> = new Map<MessageVariantId, readonly RpgRecordedToolCall[]>();

/**
 * The room's recorded turns, keyed by the variant that produced them.
 *
 * A plain `useQuery`, deliberately NOT suspense: this is a footer ornament on a transcript that must render
 * immediately. Suspending here would hold the whole row list behind an observability read — the disclosure
 * simply appears when the data lands, and a room with no game never gets a row (an empty index, no error).
 */
export function useTurnToolCallsByVariant(chatId: ChatId): ReadonlyMap<MessageVariantId, readonly RpgRecordedToolCall[]> {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.rpg.listTurnToolCalls.queryOptions({ chatId, limit: TURN_TOOL_CALLS_WINDOW }));
  if (data === undefined) {
    return EMPTY_INDEX;
  }
  return new Map(data.map((row) => [row.variantId, row.calls]));
}
