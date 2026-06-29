// domain/chat/assembly/speaker-stamp — the distinct-speaker gate for the SHAPE name-stamp (chat.md
// Part II §3 rule 5; Part III §12 inv 1, `no-if(isGroup)`).
//
// The trusted out-of-band `Name:` prefix that makes a MERGED multi-character transcript legible is
// applied by `applyNamesBehavior` (names.ts) AFTER squash — at a step no USER_INPUT/AI_OUTPUT regex can
// reach. This module owns the NO-OP GUARD that keeps SOLO byte-identical: `hasMultipleCharacters` only
// reports true when the canon carries >1 distinct authoring character, so a roster-of-one chat gets no
// prefix and ships a transcript byte-identical to the pre-group path.
//
// The OTHER half of L10 — `sanitizeSpeakerLookalike` (neutralizing a member-authored leading `Name:` /
// `<speaker>` on the RAW body so it can't FORGE the trusted prefix) — runs at `loadCanonHistory` (the
// RECEIVE/load seam), NOT here: it operates on stored canon before SHAPE ever sees it. Per the chat.md
// movement decision it lives in `@orb/kit/speaker-label`; SHAPE consumes already-sanitized canon.

import type { CharacterId } from "@orb/kit/ids";

/** True when the canon history carries MORE THAN ONE distinct authoring character among its assistant
 *  rows — the gate that turns the per-character `Name:` prefix on. SOLO (a roster-of-one chat, or any
 *  history authored by a single character) returns false → the prefix passes are no-ops and the
 *  delivered transcript is byte-identical to the pre-group path. Rows with no resolved `characterId`
 *  (legacy / deleted / the egocentric-folded user rows) don't count toward distinctness; if EVERY
 *  assistant row is unattributed this is false (a single fallback name applies). */
export function hasMultipleCharacters(
  history: readonly { role: "user" | "assistant"; characterId?: CharacterId | null }[],
): boolean {
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
