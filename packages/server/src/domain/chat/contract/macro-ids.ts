// domain/chat/contract/macro-ids — the shared id-COVERAGE projections `persistence/macro-names.ts` (the
// NAME producer) and `persistence/roster-avatars.ts` (the persona AVATAR producer, kept a separate file/
// type per Chat-Macro-Resolution.md §1 — names-only) both consume, so the ONE `collectMacroIds` coverage
// algorithm (every participant's seat/active-persona id UNION every stored message row's stamp) is never
// re-spelled. `types-in-contract` (§7.4) forbids an exported interface outside `contract/`, hence the move
// here rather than declaring them file-local in `persistence/macro-names.ts`.

import type { CharacterId, PersonaId } from "@orb/kit/ids";

/** A roster projection carrying the two participant-scoped macro ids — satisfied by `ParticipantView` and
 *  by a raw `chat_participants` row alike. */
export interface ParticipantMacroIdSource {
  readonly characterId: CharacterId | null;
  readonly activePersonaId: PersonaId | null;
}

/** A message-row projection carrying the two per-row macro STAMPS — satisfied by `MessageView` and by a
 *  raw `messages` row alike. */
export interface MessageMacroIdSource {
  readonly characterId: CharacterId | null;
  readonly personaId: PersonaId | null;
}
