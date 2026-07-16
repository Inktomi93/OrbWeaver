// Builds the row-independent half of a MessageRenderContext from the same per-chat macro-name producer
// resolveRowAttribution already consumes — never a second data source, never re-resolved from body
// text. Both macro subjects ({{char}}, {{user}}) are per-row and built by the caller instead; this
// helper supplies only the defaults: the solo-chat {{char}} fallback, the joined cast, and the chat's
// anchor persona as the {{user}}/{{persona}} fallback (never the viewer's own active persona).

import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import type { MessageRenderContext } from "#lib";

export interface ResolveMessageRenderContextInput {
  readonly participants?: ReadonlyMap<CharacterId, ParticipantView> | undefined;
  readonly characterNamesById: ReadonlyMap<CharacterId, RowCharacterName>;
  readonly personaNamesById: ReadonlyMap<PersonaId, RowPersonaName>;
  readonly anchorPersonaId?: PersonaId | null | undefined;
  readonly autoFixMarkdown?: boolean | undefined;
}

const SOLO_CAST_FLOOR = 1;

// Never participants[0] (same anti-guess rule as attribution's Narrator fallback), and never "" (an
// empty string is a real value to the kit atom's ?? floor check, not "absent").
function resolveDefaultCharacterName(participants: ReadonlyMap<CharacterId, ParticipantView> | undefined): string | undefined {
  if (participants === undefined) {
    return;
  }
  let soloName: string | undefined;
  let characterCount = 0;
  for (const participant of participants.values()) {
    if (participant.kind === "character") {
      characterCount += 1;
      soloName = participant.displayName;
    }
  }
  return characterCount === SOLO_CAST_FLOOR ? soloName : undefined;
}

// In roster insertion order so the joined string matches the server's ctx.cast join byte-for-byte.
function resolveCastNames(participants: ReadonlyMap<CharacterId, ParticipantView> | undefined): readonly string[] | undefined {
  if (participants === undefined) {
    return;
  }
  const names: string[] = [];
  for (const participant of participants.values()) {
    if (participant.kind === "character") {
      names.push(participant.displayName);
    }
  }
  return names;
}

/** Every row in a chat shares one of these; per-row macro retargets ride the message's own
 *  characterId/personaId instead of a per-row context rebuild. */
export function resolveMessageRenderContext(input: ResolveMessageRenderContextInput): MessageRenderContext {
  const speakerCharName = resolveDefaultCharacterName(input.participants);
  const cast = resolveCastNames(input.participants);
  const anchorPersona = input.anchorPersonaId === null || input.anchorPersonaId === undefined ? undefined : input.personaNamesById.get(input.anchorPersonaId);
  return {
    characterNamesById: input.characterNamesById,
    personaNamesById: input.personaNamesById,
    ...(speakerCharName === undefined ? {} : { speakerCharName }),
    ...(cast === undefined ? {} : { cast }),
    ...(anchorPersona === undefined ? {} : { fallbackPersonaName: anchorPersona.name }),
    ...(anchorPersona === undefined ? {} : { fallbackPersonaDescription: anchorPersona.description }),
    ...(input.autoFixMarkdown === undefined ? {} : { autoFixMarkdown: input.autoFixMarkdown }),
  };
}
