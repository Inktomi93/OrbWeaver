// Per-row attribution resolution (#21, §12.4 attribution rules) — a PURE function so it's unit
// testable without mounting `<MessageRow>`. NEVER parses attribution from body text:
//
//  - ASSISTANT rows resolve the server-stamped `characterId` against the roster: the NAME comes from
//    the per-chat macro-name PRODUCER (`characterNamesById`, Chat-Macro-Resolution.md §1 — the SAME
//    map `resolveRowMacros`'s `{{char}}` reads for this row, so badge and macro agree by construction);
//    avatar + the per-speaker color token are separate roster CHROME (`participants`, multi-character
//    rooms only — the producer carries names only, never avatars). A null `characterId` in a
//    multi-character room is a neutral "Narrator" — never `participants[0]` (that would silently
//    misattribute a merged/narrator turn to whichever character happens to be first in the map).
//  - USER rows resolve `message.personaId` (the correct historical author across a mid-chat persona
//    switch) against the SAME producer's `personaNamesById`, falling back to `activePersonaId` (the
//    viewing participant's CURRENT persona, §4) for legacy rows with a null `personaId`. When NO persona
//    resolves (none selected — the DB may hold none, personas are user-authored + never seeded) the row
//    still labels as "You" (the viewer's own message is always self-attributable — `DEFAULT_USER_ATTRIBUTION`),
//    never bare. This chrome is DISTINCT from the `{{user}}` MACRO, which floors to "User" generically
//    through the kit engine. No avatar image yet (the producer is names-only; persona avatars await the
//    asset-URL resolver #67) — the initials fallback stands in.
//  - SYSTEM rows and an ASSISTANT id that doesn't resolve in the supplied roster render NO attribution
//    chrome (the solo-chat default when no character producer is threaded — `participants`/
//    `characterNamesById` degrade gracefully to "nothing resolves"). USER rows never go bare (above).

import type { ParticipantView } from "@orb/contracts/chat";
import type { AssetId, CharacterId, PersonaId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import type { SpeakerColorTokens } from "./speaker-color";
import { colorForCharacter } from "./speaker-color";

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
/** The viewer's OWN row when no persona is selected (the DB may genuinely hold none — personas are
 *  user-authored, never seeded). A user message is always self-attributable, so it labels as "You"
 *  (+ its initials-fallback avatar) rather than rendering bare — distinct from the `{{user}}` MACRO,
 *  which is a generic macro that floors to "User" through the kit engine (not this chrome). Persona
 *  avatar IMAGES await the asset-URL resolver (#67); initials until then. */
const DEFAULT_USER_ATTRIBUTION: RowAttribution = { name: "You", avatarAssetId: null, tokens: null };

export interface ResolveRowAttributionInput {
  readonly role: MessageRole;
  readonly characterId: CharacterId | null;
  readonly personaId: PersonaId | null;
  /** The roster, keyed by id — threaded from the surface. Absent/empty in a solo chat. Supplies
   *  assistant-row AVATAR/COLOR chrome + the solo/multi-character count; the NAME comes from
   *  `characterNamesById` below. */
  readonly participants?: ReadonlyMap<CharacterId, ParticipantView> | undefined;
  /** The per-chat macro-name producer (Chat-Macro-Resolution.md §1) — the ONE source for both this
   *  badge's name and the row's `{{char}}`/`{{user}}` macro subject. */
  readonly characterNamesById?: ReadonlyMap<CharacterId, RowCharacterName> | undefined;
  readonly personaNamesById?: ReadonlyMap<PersonaId, RowPersonaName> | undefined;
  /** The viewing participant's currently active persona — the fallback for legacy rows with a null
   *  `personaId` (Chat-Macro-Resolution.md §4; never the chat's `anchorPersonaId` pin). */
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
  const persona = personaId === null ? undefined : input.personaNamesById?.get(personaId);
  if (persona === undefined) {
    return DEFAULT_USER_ATTRIBUTION; // no persona selected → the viewer's own row still labels ("You")
  }
  return { name: persona.name, avatarAssetId: null, tokens: null };
}

function resolveAssistantAttribution(input: ResolveRowAttributionInput): RowAttribution {
  if (input.characterId === null) {
    return isMultiCharacterRoom(input.participants) ? NARRATOR_ATTRIBUTION : NO_ATTRIBUTION;
  }
  const name = input.characterNamesById?.get(input.characterId)?.name;
  if (name === undefined) {
    return NO_ATTRIBUTION;
  }
  const participant = input.participants?.get(input.characterId);
  return {
    name,
    avatarAssetId: participant?.avatarAssetId ?? null,
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
