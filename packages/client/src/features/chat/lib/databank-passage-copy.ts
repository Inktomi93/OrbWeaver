// What the Preview diagnostics say about the document passages a turn retrieved.

import { groupThousands } from "@orb/kit/strings";

/** The section heading over the retrieved passages, with how many there are. */
export function databankPassagesHeading(count: number): string {
  return `Databank: ${count} ${count === 1 ? "passage" : "passages"} retrieved`;
}

/** Where a passage sits in its document's text, as the characters it covers. */
export function databankPassageSpan(charStart: number, charEnd: number): string {
  return `Characters ${groupThousands(charStart)} to ${groupThousands(charEnd)}`;
}
