// Per-row attribution resolution — a pure function, unit-testable without mounting MessageRow, that
// never parses attribution from body text. Assistant rows resolve the server-stamped characterId
// against the roster; user rows resolve personaId (falling back to activePersonaId for legacy rows) but
// never go bare — a viewer's own row always labels as "You". A null characterId in a multi-character
// room is a neutral "Narrator", never participants[0] (which would misattribute a merged turn).

import type { ParticipantView } from "@orb/contracts/chat";
import type { AssetId, CharacterId, PersonaId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { colorForCharacter } from "./speaker-color";

export interface RowAttribution {
  /** `null` = render no attribution chrome. */
  readonly name: string | null;
  /** Which side of the two-kind cast this row's identity resolved from; `null` only alongside
   *  `name === null`. Consumers stamp it as `data-*`, never branch JSX on it. */
  readonly kind: "character" | "persona" | null;
  readonly avatarAssetId: AssetId | null;
  /** The avatar's CAS hash — `null` renders the initials fallback. */
  readonly avatarHash: string | null;
  /** Stable per-entity seed for the deterministic fallback hue — the same id the library card / chat
   *  header seed with, so one entity resolves to one color everywhere. */
  readonly hueSeed: string;
  /** Per-speaker theme tokens for the row's bubble; `null` for user rows and unresolved rows. */
  readonly tokens: ThemeScopeTokens | null;
}

const NO_ATTRIBUTION: RowAttribution = {
  name: null,
  kind: null,
  avatarAssetId: null,
  avatarHash: null,
  hueSeed: "",
  tokens: null,
};
const NARRATOR_ATTRIBUTION: RowAttribution = {
  name: "Narrator",
  kind: "character",
  avatarAssetId: null,
  avatarHash: null,
  hueSeed: "narrator",
  tokens: null,
};
const DEFAULT_USER_ATTRIBUTION: RowAttribution = {
  name: "You",
  kind: "persona",
  avatarAssetId: null,
  avatarHash: null,
  hueSeed: "you",
  tokens: null,
};

export interface ResolveRowAttributionInput {
  readonly role: MessageRole;
  readonly characterId: CharacterId | null;
  readonly personaId: PersonaId | null;
  readonly participants?: ReadonlyMap<CharacterId, ParticipantView> | undefined;
  readonly characterNamesById?: ReadonlyMap<CharacterId, RowCharacterName> | undefined;
  readonly personaNamesById?: ReadonlyMap<PersonaId, RowPersonaName> | undefined;
  readonly personaAvatarsById?: ReadonlyMap<PersonaId, string | null> | undefined;
  /** Fallback for legacy rows with a null personaId; never the chat's anchorPersonaId pin. */
  readonly activePersonaId?: PersonaId | null | undefined;
}

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
    return DEFAULT_USER_ATTRIBUTION;
  }
  const avatarHash = (personaId === null ? undefined : input.personaAvatarsById?.get(personaId)) ?? null;
  return {
    name: persona.name,
    kind: "persona",
    avatarAssetId: null,
    avatarHash,
    hueSeed: personaId ?? "you",
    tokens: null,
  };
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
  const tokens = participant?.themeOverride ?? colorForCharacter(input.characterId);
  return {
    name,
    kind: "character",
    avatarAssetId: participant?.avatarAssetId ?? null,
    avatarHash: participant?.avatarHash ?? null,
    hueSeed: input.characterId,
    tokens,
  };
}

function isMultiCharacterRoom(participants: ReadonlyMap<CharacterId, ParticipantView> | undefined): boolean {
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

/** In a true-solo room (exactly one human and one character, no other seat) the character's authored
 *  themeOverride takes over the chat-root chrome; any other composition falls back to the viewer's own
 *  theme. Derived from roster composition by count, never an isGroup branch. */
const SOLO_COUNT = 1;
const TRUE_SOLO_SEATS = 2;
export function resolveRoomTheme(participants: readonly ParticipantView[] | undefined): ThemeScopeTokens | undefined {
  if (participants === undefined) {
    return;
  }
  let humanCount = 0;
  let characterCount = 0;
  let soleCharacterOverride: ThemeScopeTokens | undefined;
  for (const participant of participants) {
    if (participant.kind === "human") {
      humanCount += 1;
    } else if (participant.kind === "character") {
      characterCount += 1;
      soleCharacterOverride = participant.themeOverride ?? undefined;
    }
  }
  const trueSolo = humanCount === SOLO_COUNT && characterCount === SOLO_COUNT && participants.length === TRUE_SOLO_SEATS;
  return trueSolo ? soleCharacterOverride : undefined;
}

/** For the merged-narrator `<speaker>`-split path: name -\> the character's authored themeOverride. Only
 *  characters with an override are included (others fall through to the hash tint). */
export function speakerThemesByName(participants: ReadonlyMap<CharacterId, ParticipantView> | undefined): ReadonlyMap<string, ThemeScopeTokens> {
  const byName = new Map<string, ThemeScopeTokens>();
  if (participants === undefined) {
    return byName;
  }
  for (const participant of participants.values()) {
    const override = participant.themeOverride;
    if (participant.kind === "character" && override !== null && override !== undefined) {
      byName.set(participant.displayName, override);
    }
  }
  return byName;
}
