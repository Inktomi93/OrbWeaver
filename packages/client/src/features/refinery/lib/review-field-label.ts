// How the review queue names a target inside a verb: "Keep description", "Discard creator notes", "Discard greeting 3".
// One source, so the queue and the tests that press its buttons read the same words.
import { NEW_GREETING_LABEL, slotLabelOf } from "./render-plan.ts";

/** The lowercase target name a queue button carries after its verb. */
export function reviewFieldLabel(field: string, greetingIndex?: number): string {
  return slotLabelOf(field, greetingIndex).toLowerCase();
}

/** What the queue calls an appended greeting inside a verb. */
export const NEW_GREETING_REVIEW_LABEL = NEW_GREETING_LABEL.toLowerCase();
