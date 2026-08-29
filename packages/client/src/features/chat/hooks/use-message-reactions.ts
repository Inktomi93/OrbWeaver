// B6/MR2 — the room's reaction window, selected by the row's OWN variant; B7 adds the room's RESOLVED
// reactions-enabled verdict riding the same read.
//
// ONE NETWORK READ PER ROOM, with one CHEAP SELECTOR per mounted row (the `useTurnToolCallsForVariant`
// shape). React Query deduplicates the chat-scoped read across every visible message; selecting the row's
// own variant means a toggle anywhere in the room wakes only the rows whose value actually changed, instead
// of publishing one new room-wide array identity to every row in the transcript.
//
// SWIPE-CORRECT WITH NO REFETCH: the selector keys on `message.selectedVariantId`, and the server ships every
// reaction of a windowed SLOT (its dead swipes' included), so swiping re-targets data the client already
// holds. That is also why the read is not folded into `MessageView` — a per-variant join on every canon read
// and every bus carrier, to render an ornament most rows never carry.
//
// THE ENABLED VERDICT RIDES THIS READ (B7, `ChatReactionsView.reactionsEnabled`) because only the SERVER
// can resolve it (room value ?? the HOST's per-user default — a member's client cannot read the host's
// settings), and this is the read every reaction surface already consumes: OFF ⇒ the server answers
// `{enabled:false, groups:[]}`, the pill rows self-hide (empty groups) and the picker doors gate on
// `useReactionsEnabled`. While the read is in flight the verdict defaults ON — the shipped posture — so an
// enabled room's doors never flash out.
//
// FRESHNESS IS THE BUS, and only the bus: `reactionsChanged` is the one driver
// (`data/invalidation.ts::BUS_FILTERS`), which is what makes the owner's test — "react; the second tab sees
// it live" — true. The toggle mutation is therefore `busDriven` and names no filters of its own. The
// enabled flip rides `chatUpdated` (the `setReactionsEnabled` verb emits it) + the same reactions read
// invalidation.
//
// NOT SUSPENSE, deliberately: this is a footer ornament on a transcript that must render immediately.
// Suspending here would hold the whole row list behind it; the pills simply appear when the data lands.

import type { ChatReactionsView, MessageReactionGroup } from "@orb/contracts/chat";
import type { ChatId, ChatParticipantId, MessageVariantId } from "@orb/kit/ids";
import { useGatedQuery, useTRPC } from "#data";

const EMPTY_GROUPS: readonly MessageReactionGroup[] = [];

/** The viewer's own SEAT in this room, derived from the room read every chat surface already holds — the
 *  `aria-pressed` answer for a chip ("did *I* react?"), which a reactor COUNT cannot give. `ChatDetail`
 *  carries `viewerUserId` server-stamped, so this is a match against the roster the client already has and
 *  never a second round-trip or a client-side guess at identity. */
export function useViewerSeatId(chatId: ChatId | null): ChatParticipantId | null {
  const trpc = useTRPC();
  const { data } = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  if (data === undefined) {
    return null;
  }
  const seat = data.participants.find((p) => p.userId === data.viewerUserId && p.leftSeq === null);
  return seat?.id ?? null;
}

/** The grouped reactions for ONE variant, out of the room's shared window. Empty until the read lands, and
 *  empty forever in a room nobody has reacted in — which is the pill row's applicability gate, not a state. */
export function useReactionsForVariant(chatId: ChatId | null, variantId: MessageVariantId): readonly MessageReactionGroup[] {
  const trpc = useTRPC();
  const { data } = useGatedQuery(chatId, (id) => ({
    ...trpc.chat.listReactions.queryOptions({ chatId: id }),
    select: (view: ChatReactionsView): readonly MessageReactionGroup[] => view.groups.filter((g) => g.variantId === variantId),
  }));
  return data ?? EMPTY_GROUPS;
}

/** The room's RESOLVED reactions posture (B7) — the gate on the picker's two doors. `true` while the read
 *  is in flight (the shipped default — an enabled room must not flash its doors out on mount). */
export function useReactionsEnabled(chatId: ChatId | null): boolean {
  const trpc = useTRPC();
  const { data } = useGatedQuery(chatId, (id) => ({
    ...trpc.chat.listReactions.queryOptions({ chatId: id }),
    select: (view: ChatReactionsView): boolean => view.reactionsEnabled,
  }));
  return data ?? true;
}
