// Builds the ROW-INDEPENDENT half of a `MessageRenderContext` (`#lib/message-render`'s MacroContext
// DATA) from the SAME per-chat macro-name PRODUCER `resolveRowAttribution` (./attribution) already
// consumes for attribution chrome — never a second data source, never re-resolved from body text
// (AGENTS.md §1 "engine vs data": the macro ENGINE lives in `kit`/`#lib/message-render`; this is the
// chat-domain DATA it runs on).
//
// BOTH macro subjects are PER-ROW and neither is built here — the caller (`MessageRow`) passes the
// row's OWN `message.characterId`/`message.personaId` as `renderMessageForDisplay`'s `rowCharacterId`/
// `rowPersonaId` arguments, which the kit atom (`resolveRowMacros`) looks up against
// `characterNamesById`/`personaNamesById`:
//   • `{{char}}` → the row's voiced speaker (a group row voiced by a specific cast member).
//   • `{{user}}` → the row's AUTHOR persona (`MessageView.personaId`) — the SAME id the #21 attribution
//     badge resolves, so macro and badge are consistent by construction, and the server's history-macro
//     pass resolves the row's `{{user}}` against the same `personaId` (viewer == model).
// This helper supplies only the DEFAULTS (`speakerCharName` = the solo-chat `{{char}}` fallback;
// `activePersonaName` = the viewing participant's current persona, the null-stamp `{{user}}` fallback,
// Chat-Macro-Resolution.md §4) plus passing the producer maps straight through.
//
// Always returns a DEFINED context (never `undefined`): the kit atom's own literal floors
// ("Character"/"User") mean an empty producer never erases a macro word the way an ad hoc "" ctx
// value would — there is no more "bail out to keep content untouched" case to guard against.

import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import type { MessageRenderContext } from "#lib";

export interface ResolveMessageRenderContextInput {
  /** The roster, keyed by id — same map `MessageRow` threads to `resolveRowAttribution`. Used ONLY to
   *  derive the solo-chat `{{char}}` default here (names/avatars are the producer's/roster's job
   *  elsewhere). */
  readonly participants?: ReadonlyMap<CharacterId, ParticipantView> | undefined;
  /** The per-chat macro-name producer (Chat-Macro-Resolution.md §1) — `chat.getChat`'s `macroNames`
   *  merged with the loaded `listMessages` page's `macroNames`. */
  readonly characterNamesById: ReadonlyMap<CharacterId, RowCharacterName>;
  readonly personaNamesById: ReadonlyMap<PersonaId, RowPersonaName>;
  /** The viewing participant's CURRENT persona id (§4) — the null-stamp `{{user}}` fallback SUBJECT;
   *  resolved to a NAME here via `personaNamesById` (never the chat's `anchorPersonaId` pin). */
  readonly viewerActivePersonaId?: PersonaId | null | undefined;
  /** ST `auto_fix_generated_markdown` parity (the `autoFixMarkdown` appearance pref) — passed straight
   *  through onto the render context so the display pipeline's `fixMarkdown` step is gated (default OFF). */
  readonly autoFixMarkdown?: boolean | undefined;
}

const SOLO_CAST_FLOOR = 1;

/** `{{char}}`'s default/fallback name: a solo chat's one character (cast-of-one, per kit's
 *  `MacroContext.cast` doc), or `undefined` when the roster is unwired / ambiguous (2+ characters, no
 *  row-specific speaker to retarget with) — never `participants[0]` (same anti-guess rule as
 *  attribution's Narrator fallback), and never `""` (an empty string is a real value to the kit atom's
 *  `??` floor check, not "absent" — it would erase the word instead of falling through to "Character").
 *  Counts by `kind === "character"` (NOT a non-null `characterId`) — the exact same discriminant
 *  `attribution.ts`'s `isMultiCharacterRoom` uses, so a non-character participant never skews the
 *  solo-vs-group count. */
function resolveDefaultCharacterName(
  participants: ReadonlyMap<CharacterId, ParticipantView> | undefined,
): string | undefined {
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

/** Build the room-level `MessageRenderContext` for the DISPLAY macro pass — pure, no I/O. Every row in
 *  a chat shares one of these; both per-row retargets ride `renderMessageForDisplay`'s `rowCharacterId`/
 *  `rowPersonaId` arguments (the message's own `characterId`/`personaId`), not a per-row context
 *  rebuild. */
export function resolveMessageRenderContext(
  input: ResolveMessageRenderContextInput,
): MessageRenderContext {
  const speakerCharName = resolveDefaultCharacterName(input.participants);
  const activePersonaName =
    input.viewerActivePersonaId === null || input.viewerActivePersonaId === undefined
      ? undefined
      : input.personaNamesById.get(input.viewerActivePersonaId)?.name;
  return {
    characterNamesById: input.characterNamesById,
    personaNamesById: input.personaNamesById,
    ...(speakerCharName === undefined ? {} : { speakerCharName }),
    ...(activePersonaName === undefined ? {} : { activePersonaName }),
    ...(input.autoFixMarkdown === undefined ? {} : { autoFixMarkdown: input.autoFixMarkdown }),
  };
}
