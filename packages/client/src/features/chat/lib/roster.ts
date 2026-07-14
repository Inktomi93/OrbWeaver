// The roster map builder — turns the chat roster wire array into the ReadonlyMap
// resolveRowAttribution/resolveMessageRenderContext consume, built once per roster change and read by
// every row, never re-resolved from body text. The macro-name producer is NOT built here;
// @orb/contracts/chat's own builders do that job directly (see message-list-surface.tsx).

import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, PersonaId, UserId } from "@orb/kit/ids";

// Omit, not a same-key intersection — a known TS assignability footgun that gets harder to prove as
// ParticipantView grows optional fields, silently losing the .filter narrow.
type CharacterParticipant = Omit<ParticipantView, "characterId"> & {
  readonly characterId: NonNullable<ParticipantView["characterId"]>;
};

function isCharacter(p: ParticipantView): p is CharacterParticipant {
  return p.kind === "character" && p.characterId !== null;
}

export function filterCharacters(
  participants: readonly ParticipantView[],
): readonly CharacterParticipant[] {
  return participants.filter(isCharacter);
}

export function buildParticipantsById(
  participants: readonly ParticipantView[],
): ReadonlyMap<CharacterId, ParticipantView> {
  const byId = new Map<CharacterId, ParticipantView>();
  for (const participant of participants) {
    if (participant.kind === "character" && participant.characterId !== null) {
      byId.set(participant.characterId, participant);
    }
  }
  return byId;
}

// No client auth/session concept exists yet; this is the first present human seat's activePersonaId,
// the correct proxy pre-multi-human. Null when no human participant is present.
export function resolveViewerActivePersonaId(
  participants: readonly ParticipantView[],
): PersonaId | null {
  for (const participant of participants) {
    if (participant.kind === "human") {
      return participant.activePersonaId;
    }
  }
  return null;
}

// The render-trust "own input" comparand. Null when no human is present is the fail-closed floor: with
// no resolvable viewer, no message matches "own-authored", so everything stays untrusted.
export function resolveViewerUserId(participants: readonly ParticipantView[]): UserId | null {
  for (const participant of participants) {
    if (participant.kind === "human") {
      return participant.userId;
    }
  }
  return null;
}

// leftSeq === null is the present-and-contributing predicate — a kicked/left human keeps a historical
// row but must not render as a room member.
export function resolveHumanParticipants(
  participants: readonly ParticipantView[],
): readonly ParticipantView[] {
  return participants.filter((p) => p.kind === "human" && p.leftSeq === null);
}

export function resolveIsGroupChat(participants: readonly ParticipantView[]): boolean {
  return buildParticipantsById(participants).size > 1;
}

const CAST_SECTION_FLOOR = 2;
const PEOPLE_TAB_FLOOR = 2;

/** The Members tab's Cast section floor — needs \>=2 characters to be worth its own list. */
export function castSectionVisible(participants: readonly ParticipantView[]): boolean {
  return filterCharacters(participants).length >= CAST_SECTION_FLOOR;
}

/** The Members tab's overall floor gate (chat-context-panel-surface.tsx's `showMembers`): People needs a
 *  multi-human install with \>=2 humans, Cast needs \>=2 characters; either alone justifies the tab. */
export function membersTabJustified(
  participants: readonly ParticipantView[],
  multiHumanCapable: boolean,
): boolean {
  const peopleJustifies =
    multiHumanCapable && resolveHumanParticipants(participants).length >= PEOPLE_TAB_FLOOR;
  return peopleJustifies || castSectionVisible(participants);
}
