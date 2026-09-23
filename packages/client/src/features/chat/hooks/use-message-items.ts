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

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { useEffect, useState } from "react";
import { isLiveTurnPhase, useSwipeTargetMessageId, useTurnCommittedMessageId, useTurnPhase } from "#state";
import type { ArrivalDiff } from "../lib/new-arrivals.ts";
import { initialArrivals, NO_ARRIVALS, nextArrivals } from "../lib/new-arrivals.ts";

const GHOST_APPEND_KEY = "__ghost__";

type ChatRowItem = { readonly kind: "message"; readonly view: MessageView } | { readonly kind: "ghost"; readonly id: string };

export function messageItemKey(item: ChatRowItem): string {
  return item.kind === "ghost" ? item.id : item.view.id;
}

/** The list index of the last user-role row (the just-sent prompt), or -1 — the pin-prompt scroll target.
 *  Pure over the merged item list so it can be unit-tested without a virtualizer/DOM. Typed
 *  structurally (a ChatRowItem[] satisfies it) so callers and tests need no full-MessageView value. */
export function lastUserRowIndex(items: readonly { readonly kind: "message" | "ghost"; readonly view?: { readonly role: MessageView["role"] } }[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item !== undefined && item.kind === "message" && item.view?.role === "user") {
      return i;
    }
  }
  return -1;
}

export function useMessageItems(messages: readonly MessageView[], chatId: ChatId | null): readonly ChatRowItem[] {
  const phase = useTurnPhase(chatId);
  // A live SWIPE reroll's target: the committed row the new variant replaces IN PLACE. Non-null only for a
  // `swipe` intent (continue/send/generate append or extend, never replace) — a lifecycle-only selector, so
  // reading it never re-renders the list on a delta.
  const swipeTargetId = useSwipeTargetMessageId(chatId);
  // THE GHOST HANDOVER: the canon row this live turn already committed (null until its `messageCommitted`
  // lands). Lifecycle-only, like the target selector — never re-renders the list on a delta.
  const committedId = useTurnCommittedMessageId(chatId);
  // Every canon row is a message the reader sees — D124 killed the content-less rpg "state anchor" slot this
  // list used to filter out, so there is nothing to hide.
  const base: ChatRowItem[] = messages.map((view) => ({ kind: "message", view }));

  const live = isLiveTurnPhase(phase);
  if (!live) {
    return base;
  }
  // The turn's own row is IN CANON — the seam applied that commit's `view` carrier into this very list
  // (`data/invalidation.ts` applyCanonView), so the committed row now renders the exact bytes the ghost was
  // holding and the ghost yields HERE, at the commit, rather than at `turnCompleted`. Both halves are
  // needed and neither works alone: yielding without the carrier would show the pre-turn row for the
  // refetch's 100-400 ms (the measured tail flash), and the carrier without yielding would paint the
  // committed row BESIDE the still-mounted ghost for the commit→complete window. Tested against the LIST,
  // not the flag: if the patch could not land (no cached page) the ghost holds until the refetch brings the
  // row, which is the old behavior — never a blank.
  if (committedId !== null && base.some((item) => item.kind === "message" && item.view.id === committedId)) {
    return base;
  }
  // Swipe: the ghost OCCUPIES the target message's slot (keyed by that message id, so ghost→canonical is a
  // same-key content swap — one row throughout, never a transient second row). The committed row for that id
  // is suppressed while streaming; the reroll refetch restores it in place on turnCompleted. A missing target
  // (never for a real swipe — the target is a committed message) falls through to the tail append.
  if (swipeTargetId !== null) {
    const targetIndex = base.findIndex((item) => item.kind === "message" && item.view.id === swipeTargetId);
    if (targetIndex !== -1) {
      const withGhost = [...base];
      withGhost[targetIndex] = { kind: "ghost", id: swipeTargetId };
      return withGhost;
    }
  }
  // Send/continue/generate/impersonate: the ghost appends at the tail (a fresh reply, or the continuation
  // streaming after its still-visible target). Its stable synthetic key makes the turn-complete ghost→canon
  // swap a clean key change for the virtualizer.
  return [...base, { kind: "ghost", id: GHOST_APPEND_KEY }];
}

// The semantics of new-arrival detection live with the pure diff in lib/new-arrivals.ts; this hook is
// only the React wrapper around it.
interface ArrivalTracking {
  readonly chatId: ChatId;
  readonly diff: ArrivalDiff;
}

// setState-during-render, because the answer must exist in the same render the new row first mounts;
// an effect would be one commit too late.
export function useNewArrivalKeys(items: readonly ChatRowItem[], chatId: ChatId): ReadonlySet<string> {
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
    GHOST_APPEND_KEY,
  );
  if (next === null) {
    return tracking.diff.fresh;
  }
  setTracking({ chatId, diff: next });
  return next.fresh;
}
