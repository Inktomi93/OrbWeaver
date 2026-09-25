// Tells a seeded card still exactly as the shipped pack authored it apart from one the user edited.

import type { Greeting } from "@orb/contracts/character";
import type { SeededCardContent } from "../contract/seeder.ts";

/** Ordered greeting equality — same count, same text, same group-only posture (absent ≡ false, the schema's
 *  own optional/false equivalence). An appended alternate greeting IS an edit. */
function sameGreetings(live: readonly Greeting[], prior: readonly Greeting[]): boolean {
  if (live.length !== prior.length) {
    return false;
  }
  return live.every((greeting, index) => {
    const was = prior[index];
    return was !== undefined && greeting.text === was.text && (greeting.groupOnly ?? false) === (was.groupOnly ?? false);
  });
}

/** Structural equality for the JSON-valued fields (`depthPrompt`, `source`, `extensions`, `residualData`).
 *  Both sides come from ONE producer per field — an authored fixture and the card read-seam's own parse — so
 *  key order is stable and a serialized compare is honest here; it is not offered as a general deep-equal. */
function sameJson(live: unknown, authored: unknown): boolean {
  return JSON.stringify(live ?? null) === JSON.stringify(authored ?? null);
}

/** True when the live card still carries the shipped pack's authored content byte-for-byte: a card a crashed
 *  seed left half-dressed, safe to finish (#1444). Any difference (an edited field, a cleared field, an added
 *  greeting) means the row belongs to the user. EVERY FIELD IN {@link SeededCardContent} IS COMPARED. */
export function matchesAuthoredContent(live: SeededCardContent, authored: SeededCardContent): boolean {
  return (
    live.name === authored.name &&
    live.nickname === authored.nickname &&
    live.description === authored.description &&
    live.personality === authored.personality &&
    live.scenario === authored.scenario &&
    live.exampleMessages === authored.exampleMessages &&
    live.creatorNotes === authored.creatorNotes &&
    live.systemPrompt === authored.systemPrompt &&
    live.postHistoryInstructions === authored.postHistoryInstructions &&
    live.creator === authored.creator &&
    live.cardVersion === authored.cardVersion &&
    live.creationDate === authored.creationDate &&
    live.modificationDate === authored.modificationDate &&
    sameJson(live.depthPrompt, authored.depthPrompt) &&
    sameJson(live.source, authored.source) &&
    sameJson(live.extensions, authored.extensions) &&
    sameJson(live.residualData, authored.residualData) &&
    sameGreetings(live.greetings, authored.greetings)
  );
}
