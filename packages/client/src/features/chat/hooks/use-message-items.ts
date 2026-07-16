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

export function useMessageItems(messages: readonly MessageView[], chatId: ChatId | null): readonly ChatRowItem[] {
  const phase = useTurnPhase(chatId);
  const base: ChatRowItem[] = messages.map((view) => ({ kind: "message", view }));

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
