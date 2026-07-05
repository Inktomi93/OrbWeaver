// Builds the ROW-INDEPENDENT half of a `MessageRenderContext` (`#lib/message-render`'s MacroContext
// DATA, §12.4's deferred SEAM called out in content-blocks.ts) from the SAME roster/persona maps
// `resolveRowAttribution` (./attribution) already consumes for attribution chrome — never a second
// data source, never re-resolved from body text (AGENTS.md §1 "engine vs data": the macro ENGINE lives
// in `kit`/`#lib/message-render`; this is the chat-domain DATA it runs on).
//
// `{{char}}`'s per-row retarget (a group row voiced by a specific cast member) is NOT built here — the
// caller passes the row's OWN `message.characterId` as `renderMessageForDisplay`'s `rowCharacterId`
// third argument, which looks it up against `characterNamesById`. This helper only supplies the
// DEFAULT `characterName` (the solo-chat fallback for rows with no known speaker — e.g. a user's own
// message) and the `characterNamesById` map itself.
//
// ADDITIVE DEFAULT (mirrors attribution.ts + `MessageContent`'s own optional `renderContext`): when
// NEITHER `participants` NOR `personas` is threaded at all (today's production reality — the surface
// doesn't wire the roster to `MessageRow` yet, tracked separately, out of THIS lane), this resolves to
// `undefined` rather than an all-empty context — `{{char}}`'s registry handler is a bare `ctx.char`
// passthrough (`@orb/kit/macro/registry.ts`), so an empty-string context would SILENTLY ERASE the
// macro's word (`"{{char}} waves"` → `" waves"`), which is worse than the literal-token bug it's meant
// to fix. `undefined` keeps `MessageContent`'s existing byte-identical no-op (content untouched) until
// real data actually reaches this row. Once EITHER map is threaded, a still-missing individual field
// (e.g. roster present, no persona) degrades that ONE macro to "" — a normal partial-data resolution,
// not a "we have nothing" bail-out.

import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { MessageRenderContext } from "#lib";
import type { PersonaAttribution } from "./attribution";

export interface ResolveMessageRenderContextInput {
  /** The roster, keyed by id — same map `MessageRow` threads to `resolveRowAttribution`. */
  readonly participants?: ReadonlyMap<CharacterId, ParticipantView> | undefined;
  /** The persona library, keyed by id. */
  readonly personas?: ReadonlyMap<PersonaId, PersonaAttribution> | undefined;
  /** The chat's currently ACTIVE persona — `{{user}}` is always the LIVE viewer persona, not a past
   *  row's historical author (unlike attribution chrome, which deliberately shows history). */
  readonly activePersonaId?: PersonaId | null | undefined;
}

const SOLO_CAST_FLOOR = 1;

/** `{{char}}`'s default/fallback name: a solo chat's one character (cast-of-one, per kit's
 *  `MacroContext.cast` doc), or "" when the roster is unwired / ambiguous (2+ characters, no
 *  row-specific speaker to retarget with) — never `participants[0]` (same anti-guess rule as
 *  attribution's Narrator fallback). Counts by `kind === "character"` (NOT a non-null `characterId`) —
 *  the exact same discriminant `attribution.ts`'s `isMultiCharacterRoom` uses, so a non-character
 *  participant (human/agent/observer) never skews the solo-vs-group count. */
function resolveDefaultCharacterName(
  participants: ReadonlyMap<CharacterId, ParticipantView> | undefined,
): string {
  if (participants === undefined) {
    return "";
  }
  let soloName = "";
  let characterCount = 0;
  for (const participant of participants.values()) {
    if (participant.kind === "character") {
      characterCount += 1;
      soloName = participant.displayName;
    }
  }
  return characterCount === SOLO_CAST_FLOOR ? soloName : "";
}

/** Group-row `{{char}}` retargeting map — every roster CHARACTER's display name, by id (same
 *  `kind === "character"` filter as above — a non-character participant has no place in a
 *  `CharacterId`-keyed retarget map). `undefined` when no roster is threaded (vs. an empty Map) so
 *  `renderMessageForDisplay` gets a clean "omit the key" per `exactOptionalPropertyTypes`. */
function resolveCharacterNamesById(
  participants: ReadonlyMap<CharacterId, ParticipantView> | undefined,
): ReadonlyMap<CharacterId, string> | undefined {
  if (participants === undefined) {
    return;
  }
  const byId = new Map<CharacterId, string>();
  for (const [id, participant] of participants) {
    if (participant.kind === "character") {
      byId.set(id, participant.displayName);
    }
  }
  return byId;
}

/** `{{user}}` — the chat's currently active persona name (live viewer identity), never a specific
 *  row's historical `personaId` (ST/neo macro semantics: `{{user}}` always means "whoever's chatting
 *  now", distinct from attribution's "who authored THIS row"). */
function resolveActiveUserName(
  personas: ReadonlyMap<PersonaId, PersonaAttribution> | undefined,
  activePersonaId: PersonaId | null | undefined,
): string {
  if (personas === undefined || activePersonaId === null || activePersonaId === undefined) {
    return "";
  }
  return personas.get(activePersonaId)?.name ?? "";
}

/** Build the room-level `MessageRenderContext` for the DISPLAY macro pass — pure, no I/O. Every row in
 *  a chat shares one of these; the row-specific retarget rides `renderMessageForDisplay`'s
 *  `rowCharacterId` argument (the message's own `characterId`), not a per-row context rebuild.
 *  `undefined` when NEITHER roster nor persona data is threaded at all (see header — the bail-out that
 *  keeps content untouched instead of blanking macro words with empty-string substitutions). */
export function resolveMessageRenderContext(
  input: ResolveMessageRenderContextInput,
): MessageRenderContext | undefined {
  if (input.participants === undefined && input.personas === undefined) {
    return;
  }
  const characterNamesById = resolveCharacterNamesById(input.participants);
  return {
    characterName: resolveDefaultCharacterName(input.participants),
    userName: resolveActiveUserName(input.personas, input.activePersonaId),
    ...(characterNamesById === undefined ? {} : { characterNamesById }),
  };
}
