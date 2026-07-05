// `useMessageItems` — merges the canonical `MessageView[]` (from listMessages) with the live ghost
// row into ONE id-keyed item list for `@orb/ui/message-list`. The surface consumes ONLY the lifecycle
// signal here (`useTurnPhase`, a string-stable selector) — never the token text — so a delta re-renders
// the ghost row alone, not the list (the ghost-isolation invariant, UI-Gates §11.1). The ghost carries
// a stable synthetic key (one live ghost per chat), so the ghost→canonical swap on turn-complete is a
// key change the virtualizer handles cleanly. (In-place ghosting over the swipe tip = #19, see
// use-ghost-stream.)

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { isLiveTurnPhase, useTurnPhase } from "#state";

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
