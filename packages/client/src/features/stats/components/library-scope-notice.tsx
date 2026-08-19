// The Analytics CONTEXT panel's SCOPE STATEMENT — one home for the sentence a library-scoped tab owes
// when a character is drilled in CONTENT (side-eye rail-analytics 2026-08-19 P1b).
//
// WHY IT EXISTS. The CONTEXT band names the drilled character (§6.3 N4/P4 — the Content ↔ Context bind),
// which reads as a claim that everything below it is that character's. Two of the three dimension tabs
// cannot honour that claim: `model_stats` is owner+model grain and `daily_stats` is owner+day grain, so
// neither carries a character axis to narrow on. The measured result was the drilled character's face
// above the whole library's numbers — including two different latency values for "the same" metric on
// screen simultaneously.
//
// The band's face is NOT dropped (that is a landed §6.3 ruling with its own CT); the numbers state their
// own scope instead. Renders NOTHING when nothing is drilled — library scope is the unsurprising default
// there, and a permanent caption teaches the eye to skip it exactly when it starts mattering.

import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useSelectedAnalyticsCharacterId } from "#state";

/** `reason` names WHY this tab can't scope, in the reader's terms — one clause, no table names. */
export function LibraryScopeNotice({ reason }: { readonly reason: string }): ReactElement | null {
  const drilled = useSelectedAnalyticsCharacterId();
  if (drilled === null) {
    return null;
  }
  return (
    <Text voice="gloss" role="note" data-slot="analytics-library-scope">
      Whole library — not just the character you opened. {reason}
    </Text>
  );
}
