// domain/chat/assembly/speaker-stamp — the distinct-speaker gate for the SHAPE name-stamp (`no-if(isGroup)`).
//
// The trusted out-of-band `Name:` prefix that makes a MERGED multi-character transcript legible is
// applied by `applyNamesBehavior` (names.ts) AFTER squash — at a step no USER_INPUT/AI_OUTPUT regex can
// reach. This module owns the NO-OP GUARD that keeps SOLO byte-identical: `hasMultipleCharacters` only
// reports true when the canon carries >1 distinct authoring character, so a roster-of-one chat gets no
// prefix and ships a transcript byte-identical to the pre-group path.
//
// The trusted prefix stays un-forgeable WITHOUT a load-time sanitize: it is added at SHAPE (`names.ts`),
// a step no stored body can reach, so a member's own leading `Name:`/`<speaker>` inside their content is
// left as inline prose — it never becomes the trusted label. The write-side self-label strip that DOES
// exist is `@orb/kit/speaker-label`'s `stripSelfSpeakerLabel`, called on the EDIT path (`verbs/edit.ts`)
// to keep a re-saved row's canon pure; the per-speaker generate path is cleaned at RECEIVE by
// `cleanPerSpeakerReply` (`engine/pipeline.ts`). There is no `loadCanonHistory` sanitize step (and no
// `sanitizeSpeakerLookalike` function) — SHAPE consumes stored canon as-is.

import type { CharacterId } from "@orb/kit/ids";

/** True when the canon history carries MORE THAN ONE distinct authoring character among its assistant
 *  rows — the gate that turns the per-character `Name:` prefix on. SOLO (a roster-of-one chat, or any
 *  history authored by a single character) returns false → the prefix passes are no-ops and the
 *  delivered transcript is byte-identical to the pre-group path. Rows with no resolved `characterId`
 *  (legacy / deleted / the egocentric-folded user rows) don't count toward distinctness; if EVERY
 *  assistant row is unattributed this is false (a single fallback name applies). */
export function hasMultipleCharacters(history: readonly { role: "user" | "assistant"; characterId?: CharacterId | null }[]): boolean {
  const seen = new Set<CharacterId>();
  for (const m of history) {
    if (m.role === "assistant" && m.characterId !== null && m.characterId !== undefined) {
      seen.add(m.characterId);
      if (seen.size > 1) {
        return true;
      }
    }
  }
  return false;
}
