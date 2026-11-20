// Merges the canonical MessageView[] with the live ghost row into one id-keyed item list. Consumes only
// the lifecycle signals (useTurnPhase + the swipe target selector), never token text, so a delta
// re-renders the ghost row alone, not the list. A fresh reply / continue / generate appends the ghost at
// the tail under a stable synthetic key, so the ghost->canonical swap on turn-complete is a clean key
// change for the virtualizer. A SWIPE reroll instead places the ghost INTO its target message's slot
// (keyed by that message id) and suppresses the committed row for that id while streaming — one row
// throughout, the new variant streaming in place, never a transient second row beside the old one.
//
// The ghost's life ends at its COMMIT, not at `turnCompleted`: the invalidation seam applies the commit's
// `view` carrier straight into this list, so canon carries the ghost's own bytes from that instant (see the
// handover note below and `data/invalidation.ts` applyCanonView).
//
// THE COMMITTED ROW TAKES THE GHOST'S ITEM. A fresh reply's row keeps the key its ghost streamed under for as long as
// this list lives (`aliases`), and a swipe's row already shares its ghost's key, so the virtualizer and React see one
// item throughout. A swiped row counts as the turn's row only once it has moved off the variant it was swiped from, since
// the stream store hears of the commit before this list holds its view. While that row has not drawn
// (`row-handover.tsx`), its item still carries the ghost over it (`underGhost`) and the closed turn's held ghost is not
// released, so the streamed panels stay on screen until the settled frame replaces them. A `continue` extends a row that stays on screen as its own item, so its ghost yields at
// the commit as before. Each turn's ghost appends under a fresh key, so no earlier row ever has to give its key back.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { useEffect, useState } from "react";
import { releaseGhostHandover } from "#data";
import { isLiveTurnPhase, useGhostExtendsMessageId, useHeldGhost, useSwipeTargetMessageId, useTurnCommittedMessageId, useTurnPhase } from "#state";
import type { ArrivalDiff } from "../lib/new-arrivals.ts";
import { initialArrivals, NO_ARRIVALS, nextArrivals } from "../lib/new-arrivals.ts";

const GHOST_APPEND_KEY = "__ghost__";

type ChatRowItem =
  | {
      readonly kind: "message";
      readonly view: MessageView;
      /** The row's list key: its id, or the key its ghost streamed under. */
      readonly key: string;
      /** The turn's ghost still stands over this row, which has not drawn yet. */
      readonly underGhost: boolean;
    }
  | { readonly kind: "ghost"; readonly id: string };

/** Preserve each canonical row arm while narrowing the message fields a pure reader consumes. */
export type ChatRowProjection<Field extends keyof MessageView> =
  | (Pick<Extract<ChatRowItem, { readonly kind: "message" }>, "kind"> & { readonly view: Pick<MessageView, Field> })
  | Pick<Extract<ChatRowItem, { readonly kind: "ghost" }>, "kind">;

export function messageItemKey(item: ChatRowItem): string {
  return item.kind === "ghost" ? item.id : item.key;
}

/** The list index of the last user-role row (the just-sent prompt), or -1 — the pin-prompt scroll target.
 *  Pure over the merged item list so it can be unit-tested without a virtualizer/DOM. Typed
 *  structurally (a ChatRowItem[] satisfies it) so callers and tests need no full-MessageView value. */
export function lastUserRowIndex(items: readonly ChatRowProjection<"role">[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item !== undefined && item.kind === "message" && item.view.role === "user") {
      return i;
    }
  }
  return -1;
}

// The variant a swipe streams over: its row stays in the list, so the row shows the turn's commit only once it has
// moved off this variant.
interface SwipedFrom {
  readonly messageId: MessageId;
  readonly variantId: MessageView["selectedVariantId"];
}

// The list's own key memory for one room: the keys committed rows took from their ghosts, the turn count that names the
// next ghost's key, the committed row that last reported it drew, and the variant the live swipe replaces.
interface ItemKeys {
  readonly chatId: ChatId | null;
  readonly aliases: ReadonlyMap<MessageId, string>;
  readonly turns: number;
  readonly drawn: MessageId | null;
  readonly swipedFrom: SwipedFrom | null;
}

function freshKeys(chatId: ChatId | null): ItemKeys {
  return { chatId, aliases: new Map<MessageId, string>(), turns: 0, drawn: null, swipedFrom: null };
}

// The key memory after this render. On the commit's first render a fresh reply's row takes its ghost's key and the next
// ghost gets a new one; a swipe or continue row keeps its own. A turn with no commit yet clears the last drawn word, so a
// swipe that reuses a row waits for that row to draw again; a pending swipe also records the variant it streams over.
function nextItemKeys(
  keys: ItemKeys,
  turn: { readonly shown: MessageId | null; readonly pending: { readonly swipedFrom: SwipedFrom | null } | null; readonly keepsOwnKey: boolean },
): ItemKeys {
  if (turn.shown !== null && !turn.keepsOwnKey && !keys.aliases.has(turn.shown)) {
    return { ...keys, aliases: new Map(keys.aliases).set(turn.shown, ghostKeyOf(keys.turns)), turns: keys.turns + 1 };
  }
  if (turn.pending === null) {
    return keys;
  }
  const { swipedFrom } = turn.pending;
  const sameSwipe = swipedFrom?.messageId === keys.swipedFrom?.messageId && swipedFrom?.variantId === keys.swipedFrom?.variantId;
  return keys.drawn === null && sameSwipe ? keys : { ...keys, drawn: null, swipedFrom };
}

/** The merged list, the key the live ghost appends under, and the settled row's word that it drew. */
export interface MessageItems {
  readonly items: readonly ChatRowItem[];
  readonly ghostKey: string;
  readonly rowDrawn: (messageId: MessageId) => void;
}

// The rows keyed for this render, and the turn's committed row while it is still under its ghost.
interface KeyedRows {
  readonly base: ChatRowItem[];
  readonly committedShown: boolean;
  readonly settling: MessageId | null;
  readonly ghostKey: string;
  readonly rowDrawn: MessageItems["rowDrawn"];
}

function useKeyedRows(
  messages: readonly MessageView[],
  chatId: ChatId | null,
  turn: { readonly committed: MessageId | null; readonly replaced: MessageId | null; readonly extended: MessageId | null },
): KeyedRows {
  const { committed, replaced, extended } = turn;
  const [stored, setKeys] = useState<ItemKeys>(() => freshKeys(chatId));
  const room = stored.chatId === chatId ? stored : freshKeys(chatId);
  const committedView = committed === null ? undefined : messages.find((view) => view.id === committed);
  // Between the commit landing in the stream store and its view landing in this list, a swiped row still shows the
  // variant it was swiped from; that is not the turn's row yet.
  const committedShown =
    committedView !== undefined && (room.swipedFrom?.messageId !== committedView.id || room.swipedFrom.variantId !== committedView.selectedVariantId);
  const swiped = replaced === null ? undefined : messages.find((view) => view.id === replaced);
  const keys = nextItemKeys(room, {
    shown: committedShown ? committed : null,
    pending: committed === null ? { swipedFrom: swiped === undefined ? null : { messageId: swiped.id, variantId: swiped.selectedVariantId } } : null,
    keepsOwnKey: committed !== null && (committed === replaced || committed === extended),
  });
  if (keys !== stored) {
    setKeys(keys);
  }
  // The turn's committed row, once it is in the list, still under its ghost until it reports that it drew.
  const settling = committedShown && committed !== extended && keys.drawn !== committed ? committed : null;
  // Every canon row is a message the reader sees — D124 killed the content-less rpg "state anchor" slot this
  // list used to filter out, so there is nothing to hide.
  const base: ChatRowItem[] = messages.map((view) => ({ kind: "message", view, key: keys.aliases.get(view.id) ?? view.id, underGhost: view.id === settling }));
  return {
    base,
    committedShown,
    settling,
    ghostKey: ghostKeyOf(keys.turns),
    rowDrawn: (messageId): void => {
      setKeys((current) => (current.chatId !== chatId || current.drawn === messageId ? current : { ...current, drawn: messageId }));
    },
  };
}

/** `atTail` says the rows reach the room's newest message; a held ghost paints only there (an anchored window on
 *  older rows has no place for the reply that ends the room). */
export function useMessageItems(messages: readonly MessageView[], chatId: ChatId | null, atTail: boolean): MessageItems {
  const phase = useTurnPhase(chatId);
  // A live SWIPE reroll's target: the committed row the new variant replaces IN PLACE. Non-null only for a
  // `swipe` intent (continue/send/generate append or extend, never replace) — a lifecycle-only selector, so
  // reading it never re-renders the list on a delta.
  const swipeTargetId = useSwipeTargetMessageId(chatId);
  // THE GHOST HANDOVER: the canon row this live turn already committed (null until its `messageCommitted`
  // lands). Lifecycle-only, like the target selector — never re-renders the list on a delta.
  // A closed turn's ghost that still waits for its committed row: the terminal closed the slot at once, while this
  // list hears of the row through the query cache's later notification. Holding the ghost until then keeps the reply
  // on screen through the hand-over instead of painting frames with neither row.
  const held = useHeldGhost(chatId);
  const committed = useTurnCommittedMessageId(chatId) ?? held?.committedMessageId ?? null;
  // A swipe's row already holds its ghost's key; the held ghost keeps that fact once the live slot has closed.
  const replaced = swipeTargetId ?? (held?.intent === "swipe" ? held.targetMessageId : null);
  const { base, committedShown, settling, ghostKey, rowDrawn } = useKeyedRows(messages, chatId, {
    committed,
    replaced,
    extended: useGhostExtendsMessageId(chatId),
  });
  // Released after the render that shows the row drawn, so a later delete of that row cannot bring the ghost back.
  const releasable = held !== null && committedShown && settling === null ? held.committedMessageId : null;
  useEffect(() => {
    if (chatId !== null && releasable !== null) {
      releaseGhostHandover(chatId, releasable);
    }
  }, [chatId, releasable]);
  const answer = (items: readonly ChatRowItem[]): MessageItems => ({ items, ghostKey, rowDrawn });

  // The turn's own row is IN CANON — the seam applied that commit's `view` carrier into this very list
  // (`data/invalidation.ts` applyCanonView), so the committed row now renders the exact bytes the ghost was
  // holding and the ghost yields HERE, at the commit, rather than at `turnCompleted`, onto that row's own item.
  // Both halves are needed and neither works alone: yielding without the carrier would show the pre-turn row for
  // the refetch's 100-400 ms (the measured tail flash), and the carrier without yielding would paint the
  // committed row BESIDE the still-mounted ghost for the commit→complete window. Tested against the LIST,
  // not the flag: if the patch could not land (no cached page) the ghost holds until the refetch brings the
  // row, which is the old behavior — never a blank.
  if ((!isLiveTurnPhase(phase) && (held === null || !atTail)) || committedShown) {
    return answer(base);
  }
  // Swipe: the ghost OCCUPIES the target message's slot (keyed by that message id, so ghost→canonical is a
  // same-key content swap — one row throughout, never a transient second row). The committed row for that id
  // is suppressed while streaming; the reroll refetch restores it in place on turnCompleted. A missing target
  // (never for a real swipe — the target is a committed message) falls through to the tail append.
  // A held swipe ghost keeps that slot while its row still shows the variant it replaces.
  const targetIndex = replaced === null ? -1 : base.findIndex((item) => item.kind === "message" && item.view.id === replaced);
  if (replaced !== null && targetIndex !== -1) {
    const withGhost = [...base];
    withGhost[targetIndex] = { kind: "ghost", id: replaced };
    return answer(withGhost);
  }
  // Send/continue/generate/impersonate: the ghost appends at the tail (a fresh reply, or the continuation
  // streaming after its still-visible target), under this turn's own key, which its committed row then keeps.
  return answer([...base, { kind: "ghost", id: ghostKey }]);
}

// The key a turn's appended ghost streams under, and that its committed row keeps.
function ghostKeyOf(turn: number): string {
  return `${GHOST_APPEND_KEY}:${String(turn)}`;
}

// The semantics of new-arrival detection live with the pure diff in lib/new-arrivals.ts; this hook is
// only the React wrapper around it.
interface ArrivalTracking {
  readonly chatId: ChatId;
  readonly diff: ArrivalDiff;
}

// setState-during-render, because the answer must exist in the same render the new row first mounts;
// an effect would be one commit too late.
export function useNewArrivalKeys(items: readonly ChatRowItem[], chatId: ChatId, ghostKey: string): ReadonlySet<string> {
  const [tracking, setTracking] = useState<ArrivalTracking | null>(null);

  // Expire `fresh` one frame after the arrival render commits — the arriving row already latched its
  // enter flag at mount, so keeping the key fresh longer only risks a scroll-away/scroll-back remount
  // replaying the transition.
  useEffect(() => {
    if (tracking === null || tracking.diff.fresh.size === 0) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      setTracking({
        chatId: tracking.chatId,
        diff: { ...tracking.diff, fresh: NO_ARRIVALS },
      });
    });
    return (): void => cancelAnimationFrame(frame);
  }, [tracking]);

  if (tracking === null || tracking.chatId !== chatId) {
    setTracking({ chatId, diff: initialArrivals(items.map(messageItemKey)) });
    return NO_ARRIVALS;
  }

  const next = nextArrivals(
    tracking.diff,
    items.map((item) => ({
      key: messageItemKey(item),
      modelOutput: item.kind === "message" && item.view.role === "assistant",
    })),
    ghostKey,
  );
  if (next === null) {
    return tracking.diff.fresh;
  }
  setTracking({ chatId, diff: next });
  return next.fresh;
}
