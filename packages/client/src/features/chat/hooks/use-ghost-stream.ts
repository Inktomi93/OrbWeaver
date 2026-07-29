// `useGhostText`/`useGhostReasoning`/`useGhostThinking` — the ghost row's token feed (UI-Gates §11.1
// ghost-isolation). Each reads the live turn slot via `useTurnSlot`, so the component that calls them
// (ONLY `<GhostMessageRow>`, and the `<ReasoningBlock>` it composes) re-renders per delta — which is
// exactly right: the ghost is the single row that SHOULD track tokens. The surface never calls these;
// it reads `useTurnPhase` (a string-stable selector) so a delta never re-renders the list/composer.
// Reading the slot directly (not a subscribe+setState effect) also means no missed initial state and
// no synchronous set-state-in-effect.
//
// PLACEMENT NOTE: the keystone appends the ghost at the tail for a fresh send / continue / generate. A
// SWIPE reroll instead ghosts IN PLACE over its target — `useMessageItems` reads the slot's stable
// `targetMessageId` via the lifecycle-only `useSwipeTargetMessageId` selector (no per-delta surface
// re-render) and places the ghost into that message's slot, suppressing the committed row until the
// reroll refetch restores it. Continue still appends (its old text stays visible below its extension).

import type { ChatId } from "@orb/kit/ids";
import { useTurnSlot } from "#state";

/** The live turn's streamed token text for `chatId` — populated while `streaming`/`stopping` (mirrors
 *  `useGhostReasoning` below: the store keeps accumulating `text` through `stopping`, so the render
 *  side must keep reading it then too), "" while pending / off-turn. */
export function useGhostText(chatId: ChatId | null): string {
  const slot = useTurnSlot(chatId);
  return slot.phase === "streaming" || slot.phase === "stopping" ? slot.text : "";
}

/** The live turn's streamed reasoning text for `chatId` — populated while `streaming`/`stopping`
 *  (the phases that carry a `reasoning` field), "" otherwise (`pending` has no reasoning yet). */
export function useGhostReasoning(chatId: ChatId | null): string {
  const slot = useTurnSlot(chatId);
  return slot.phase === "streaming" || slot.phase === "stopping" ? slot.reasoning : "";
}

/** True while the live turn has NO answer token yet — the TTFT "thinking" window `<ReasoningBlock>`
 *  force-opens for (`reasoning-block.tsx`). `pending` (no token of any kind has arrived) counts as
 *  thinking; once `streaming`/`stopping` carries reasoning but the answer `text` is still empty, it's
 *  still thinking; the window ends the instant an answer-text token lands. */
export function useGhostThinking(chatId: ChatId | null): boolean {
  const slot = useTurnSlot(chatId);
  if (slot.phase === "pending") {
    return true;
  }
  if (slot.phase === "streaming" || slot.phase === "stopping") {
    return slot.text === "" && slot.reasoning !== "";
  }
  return false;
}
