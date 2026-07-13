// `useMessageItems` — merges the canonical `MessageView[]` (from listMessages) with the live ghost
// row into ONE id-keyed item list for `@orb/ui/message-list`. The surface consumes ONLY the lifecycle
// signal here (`useTurnPhase`, a string-stable selector) — never the token text — so a delta re-renders
// the ghost row alone, not the list (the ghost-isolation invariant, UI-Gates §11.1). The ghost carries
// a stable synthetic key (one live ghost per chat), so the ghost→canonical swap on turn-complete is a
// key change the virtualizer handles cleanly. (In-place ghosting over the swipe tip = #19, see
// use-ghost-stream.)

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { useEffect, useState } from "react";
import { isLiveTurnPhase, useTurnPhase } from "#state";
import type { ArrivalDiff } from "../lib/new-arrivals";
import { initialArrivals, NO_ARRIVALS, nextArrivals } from "../lib/new-arrivals";

/** The synthetic key for the appended ghost (at most one live ghost per chat → a constant is stable). */
const GHOST_APPEND_KEY = "__ghost__";

type ChatRowItem =
  | { readonly kind: "message"; readonly view: MessageView }
  | { readonly kind: "ghost"; readonly id: string };

/** The stable list key for a row item — a real message id or the ghost's synthetic key. */
export function messageItemKey(item: ChatRowItem): string {
  return item.kind === "ghost" ? item.id : item.view.id;
}

/** Merge canon + the live ghost (appended at the tail while a turn is live) into the item list. */
export function useMessageItems(
  messages: readonly MessageView[],
  chatId: ChatId | null,
): readonly ChatRowItem[] {
  const phase = useTurnPhase(chatId);
  const base: ChatRowItem[] = messages.map((view) => ({ kind: "message", view }));

  const live = isLiveTurnPhase(phase);
  if (!live) {
    return base;
  }
  return [...base, { kind: "ghost", id: GHOST_APPEND_KEY }];
}

// ── New-arrival detection (motion guide §4.2 item 1) ───────────────────────────────────────────────
// The SEMANTICS (why arrival is decided in item space, what counts as an arrival, and why EXIT is
// deliberately not animated) live with the pure diff: `lib/new-arrivals.ts`. This hook is only the
// React wrapper around it.

interface ArrivalTracking {
  readonly chatId: ChatId;
  readonly diff: ArrivalDiff;
}

/**
 * The item keys that GENUINELY arrived this render (`lib/new-arrivals.ts`) — the only rows that get
 * an enter transition. Uses the render-time "derive from previous render" state pattern (the
 * sanctioned setState-during-render form), because the answer must exist in the SAME render the new
 * row first mounts; an effect would be one commit too late.
 */
export function useNewArrivalKeys(
  items: readonly ChatRowItem[],
  chatId: ChatId,
): ReadonlySet<string> {
  const [tracking, setTracking] = useState<ArrivalTracking | null>(null);

  // Expire `fresh` one frame after the arrival render commits: the arriving row LATCHED its enter
  // flag at mount (use-enter-motion.ts), so keeping the key fresh any longer only risks a
  // scroll-away/scroll-back remount replaying the transition (the windowed list calls `renderItem`
  // from a closure over THIS hook's last returned value, so expiry must force one re-render). The
  // rAF defers the setState to the next frame tick — the same timing the enter hook flips on — so
  // this is a scheduled expiry, not a synchronous render cascade.
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
      // A committed assistant row is the content a live ghost already streamed (the zero-pop
      // contract — lib/new-arrivals.ts header). The ghost itself is exempt inside the diff.
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
