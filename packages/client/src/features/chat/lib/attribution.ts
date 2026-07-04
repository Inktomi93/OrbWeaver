// Per-row attribution resolution (#21, §12.4 attribution rules) — a PURE function so it's unit
// testable without mounting `<MessageRow>`. NEVER parses attribution from body text:
//
//  - ASSISTANT rows resolve the server-stamped `characterId` against the roster (`ParticipantView`
//    map threaded from the surface, multi-character rooms only). A null `characterId` in a
//    multi-character room is a neutral "Narrator" — never `participants[0]` (that would silently
//    misattribute a merged/narrator turn to whichever character happens to be first in the map).
//  - USER rows resolve `message.personaId` (the correct historical author across a mid-chat persona
//    switch), falling back to the chat's currently active persona for legacy rows with a null
//    `personaId`.
//  - SYSTEM rows and any id that doesn't resolve in the supplied roster render NO attribution chrome
//    (this is also the solo-chat default when no roster is threaded at all — `participants`/`personas`
//    are optional, so a caller that hasn't wired the roster yet gets the pre-#21 no-chrome behavior).

import type { ParticipantView } from "@orb/contracts/chat";
import type { AssetId, CharacterId, PersonaId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import type { SpeakerColorTokens } from "./speaker-color";
import { colorForCharacter } from "./speaker-color";

/** The minimal persona projection attribution needs (name + optional avatar reference). No
 *  `PersonaView` read-model exists in `@orb/contracts` yet — this is a deliberately small local
 *  shape a caller can build from whatever persona data it has, rather than a wire type. */
export interface PersonaAttribution {
  readonly name: string;
  readonly avatarAssetId: AssetId | null;
}

export interface RowAttribution {
  /** `null` = render no attribution chrome. */
  readonly name: string | null;
  readonly avatarAssetId: AssetId | null;
  /** The per-speaker color tokens for the row's bubble (`null` for user rows and unresolved rows —
   *  the per-role bubble token already carries the identity there). */
  readonly tokens: SpeakerColorTokens | null;
}

const NO_ATTRIBUTION: RowAttribution = { name: null, avatarAssetId: null, tokens: null };
/** A null `characterId` in a multi-character room — a real, neutral identity, not "unknown". */
const NARRATOR_ATTRIBUTION: RowAttribution = {
  name: "Narrator",
  avatarAssetId: null,
  tokens: null,
};

export interface ResolveRowAttributionInput {
  readonly role: MessageRole;
  readonly characterId: CharacterId | null;
  readonly personaId: PersonaId | null;
  /** The roster, keyed by id — threaded from the surface. Absent/empty in a solo chat. */
  readonly participants?: ReadonlyMap<CharacterId, ParticipantView> | undefined;
  /** The persona library, keyed by id — resolves a USER row's historical author. */
  readonly personas?: ReadonlyMap<PersonaId, PersonaAttribution> | undefined;
  /** The chat's currently active persona — the fallback for legacy rows with a null `personaId`. */
  readonly activePersonaId?: PersonaId | null | undefined;
}

/** Resolve one row's name/avatar/color, never from body text — always from the server-stamped id(s). */
export function resolveRowAttribution(input: ResolveRowAttributionInput): RowAttribution {
  if (input.role === "user") {
    return resolveUserAttribution(input);
  }
  if (input.role === "assistant") {
    return resolveAssistantAttribution(input);
  }
  return NO_ATTRIBUTION;
}

function resolveUserAttribution(input: ResolveRowAttributionInput): RowAttribution {
  const personaId = input.personaId ?? input.activePersonaId ?? null;
  const persona = personaId === null ? undefined : input.personas?.get(personaId);
  if (persona === undefined) {
    return NO_ATTRIBUTION;
  }
  return { name: persona.name, avatarAssetId: persona.avatarAssetId, tokens: null };
}

function resolveAssistantAttribution(input: ResolveRowAttributionInput): RowAttribution {
  if (input.characterId === null) {
    return isMultiCharacterRoom(input.participants) ? NARRATOR_ATTRIBUTION : NO_ATTRIBUTION;
  }
  const participant = input.participants?.get(input.characterId);
  if (participant === undefined) {
    return NO_ATTRIBUTION;
  }
  return {
    name: participant.displayName,
    avatarAssetId: participant.avatarAssetId,
    tokens: colorForCharacter(input.characterId),
  };
}

function isMultiCharacterRoom(
  participants: ReadonlyMap<CharacterId, ParticipantView> | undefined,
): boolean {
  if (participants === undefined) {
    return false;
  }
  const MultiCharacterFloor = 1;
  let characterCount = 0;
  for (const participant of participants.values()) {
    if (participant.kind === "character") {
      characterCount += 1;
      if (characterCount > MultiCharacterFloor) {
        return true;
      }
    }
  }
  return false;
}

const INITIALS_FALLBACK = "?";
const WHITESPACE = /\s+/u;

/** A short (≤2-char) initials fallback for the avatar's un-imaged state — derives from the first
 *  letter of up to the first two whitespace-separated words. Pure display formatting, not identity. */
export function initialsForAttribution(name: string): string {
  const words = name
    .trim()
    .split(WHITESPACE)
    .filter((word) => word.length > 0);
  const first = words[0]?.charAt(0) ?? "";
  const second = words[1]?.charAt(0) ?? "";
  const initials = `${first}${second}`.toUpperCase();
  return initials.length > 0 ? initials : INITIALS_FALLBACK;
}
