// Merges the canonical MessageView[] with the live ghost row into one id-keyed item list. Consumes only
// the lifecycle signal (useTurnPhase), never token text, so a delta re-renders the ghost row alone, not
// the list. The ghost carries a stable synthetic key, so the ghost->canonical swap on turn-complete is
// a key change the virtualizer handles cleanly.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { useEffect, useState } from "react";
import { isLiveTurnPhase, useTurnPhase } from "#state";
import type { ArrivalDiff } from "../lib/new-arrivals";
import { initialArrivals, NO_ARRIVALS, nextArrivals } from "../lib/new-arrivals";

const GHOST_APPEND_KEY = "__ghost__";

type ChatRowItem = { readonly kind: "message"; readonly view: MessageView } | { readonly kind: "ghost"; readonly id: string };

export function messageItemKey(item: ChatRowItem): string {
  return item.kind === "ghost" ? item.id : item.view.id;
}

/** The list index of the last user-role row (the just-sent prompt), or -1 — the pin-prompt scroll target
 *  (PD-147). Pure over the merged item list so it can be unit-tested without a virtualizer/DOM. Typed
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

/** An rpg STATE-ANCHOR slot: an EMPTY-body assistant row minted only to key a snapshot (a between-turns
 *  hand-edit / resync clone-forward — server `postNarratorMessage(chatId, "")`). It is not a message; hiding
 *  it keeps a hand edit from rendering a blank bubble. A committed canon row is only ever empty when it is an
 *  anchor (a real turn always carries content; a user draft never commits blank), so empty content is the
 *  precise, sufficient discriminator — no server flag needed (the wire prompt already drops the empty row via
 *  the shape-stage empty-row filter, and this hides it from the reading surface). Typed structurally (only the
 *  field it reads) so a `.test.ts` fixture needs no full MessageView. */
export function isStateAnchorSlot(view: { readonly content: string }): boolean {
  return view.content.trim() === "";
}

export function useMessageItems(messages: readonly MessageView[], chatId: ChatId | null): readonly ChatRowItem[] {
  const phase = useTurnPhase(chatId);
  const base: ChatRowItem[] = messages.filter((view) => !isStateAnchorSlot(view)).map((view) => ({ kind: "message", view }));

  const live = isLiveTurnPhase(phase);
  if (!live) {
    return base;
  }
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
