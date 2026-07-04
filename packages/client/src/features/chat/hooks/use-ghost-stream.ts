// `useGhostText` — the ghost row's token feed (UI-Gates §11.1 ghost-isolation). It reads the live turn
// slot via `useTurnSlot`, so the component that calls it (ONLY `<GhostMessageRow>`) re-renders per
// delta — which is exactly right: the ghost is the single row that SHOULD track tokens. The surface
// never calls this; it reads `useTurnPhase` (a string-stable selector) so a delta never re-renders the
// list/composer. Reading the slot directly (not a subscribe+setState effect) also means no missed
// initial state and no synchronous set-state-in-effect.
//
// PLACEMENT NOTE (#19): the keystone appends the ghost at the tail (fresh send). In-place ghosting over
// the tip for a swipe/continue regeneration needs the slot's stable `targetMessageId` read WITHOUT
// re-rendering the surface per delta (a lifecycle-only store selector) — that lands with the fuller
// variant UX in #19; until then a swipe streams into an appended ghost.

import type { ChatId } from "@orb/kit/ids";
import { useTurnSlot } from "#state";

/** The live turn's streamed token text for `chatId`, or "" while pending / off-turn. */
export function useGhostText(chatId: ChatId | null): string {
  const slot = useTurnSlot(chatId);
  return slot.phase === "streaming" ? slot.text : "";
}
