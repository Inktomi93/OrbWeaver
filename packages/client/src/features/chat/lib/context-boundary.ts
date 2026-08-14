// domain/chat lib/context-boundary — Phase 4b §B.5.2 "last-in-context" boundary marker. Pure, unit-
// tested resolver: WHICH message the divider renders above.
//
// The server stamps EVERY assistant variant with its OWN generation's `contextBoundaryMessageId` (the
// earliest history message the §8 history-budget fit-pass kept for THAT turn — `null` when nothing was
// dropped). Only the MOST RECENT assistant turn reflects "where the model's memory currently cuts off":
// an older turn's boundary was computed against a shorter, since-grown history and is stale the moment a
// newer assistant turn lands. The newest assistant generation's stamp is AUTHORITATIVE, `null` included —
// a `null` there means "everything fit THIS turn" (truthful), not "no data". Walk newest→oldest to the
// first ASSISTANT row and return its stamp verbatim; skip user/system rows (a trailing user message the
// NEXT generation hasn't fit-passed yet carries no boundary answer) and NEVER walk past that truthful
// null into a stale older stamp — that would resurrect a boundary the newest generation retired.
//
// Every assistant canon row is a real GENERATION that ran a fit-pass (D124 retired the rpg state-anchor
// slot, which never ran one — its ABSENT stamp read as the truthful "everything fit this turn" and
// suppressed the divider outright on any chat whose host had resynced).

import type { MessageView } from "@orb/contracts/chat";

/** The id of the earliest message still "in context" as of the most recent ASSISTANT generation, or
 *  `null` when that generation dropped nothing (everything fit) — or no assistant turn has generated
 *  yet. Either way `null` = no divider to show. */
export function resolveContextBoundaryMessageId(messages: readonly MessageView[]): MessageView["id"] | null {
  return messages.findLast((row) => row.role === "assistant")?.contextBoundaryMessageId ?? null;
}
