// domain/chat lib/context-boundary — Phase 4b §B.5.2 "last-in-context" boundary marker. Pure, unit-
// tested resolver: WHICH message the divider renders above.
//
// The server stamps EVERY assistant variant with its OWN generation's `contextBoundaryMessageId` (the
// earliest history message the §8 history-budget fit-pass kept for THAT turn — `null` when nothing was
// dropped). Only the MOST RECENT stamped turn reflects "where the model's memory currently cuts off":
// an older turn's boundary was computed against a shorter, since-grown history and is stale the moment
// a newer turn lands. Walk messages newest→oldest and return the first non-null boundary found — the
// current-state answer, byte-consistent with what the composer's next Send will actually assemble
// (module the current turn's own trailing user message, which the NEXT generation's fit-pass will
// account for).

import type { MessageView } from "@orb/contracts/chat";

/** The id of the earliest message still "in context" as of the most recent generation, or `null` when
 *  nothing has ever been dropped (or no assistant turn has generated yet) — no divider to show. */
export function resolveContextBoundaryMessageId(messages: readonly MessageView[]): MessageView["id"] | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m !== undefined && m.contextBoundaryMessageId !== null) {
      return m.contextBoundaryMessageId;
    }
  }
  return null;
}
