// The roster MAP builder — the ONE place that turns the chat roster wire array (`chat.getChat`'s
// `ParticipantView[]`) into the `ReadonlyMap` `resolveRowAttribution` (./attribution) and
// `resolveMessageRenderContext` (./message-render-context) consume for the solo-cast `{{char}}`
// default + the assistant-row avatar/color chrome — never re-resolved from body text, never rebuilt
// per row (the surface calls this once per roster change, `MessageRow` just reads the map).
//
// The MACRO NAME producer (`characterNamesById`/`personaNamesById`, Chat-Macro-Resolution.md §1) is
// NOT built here: `@orb/contracts/chat`'s own `buildCharacterNameMap`/`buildPersonaNameMap` already do
// that job directly over the wire `ChatMacroNameProducer` (`chat.getChat`'s `macroNames` merged with
// `chat.listMessages`'s page `macroNames`) — this file would only re-wrap them, so the surface calls
// the contracts builders straight (see `message-list-surface.tsx`).

import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";

/** The chat's roster, keyed by character id — filters to `kind === "character"` participants (a
 *  human/agent/observer participant has no place in a `CharacterId`-keyed map; same discriminant
 *  `attribution.ts`/`message-render-context.ts` already use for the identical filter). */
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

/** The viewing participant's CURRENT persona id (Chat-Macro-Resolution.md §4 `activePersona`) — the
 *  null-stamp `{{user}}`/attribution fallback SUBJECT (never the chat's `anchorPersonaId`, which is a
 *  different axis: the CARD-only, chat-open PIN, §4). No client auth/session concept exists yet (task
 *  #50 pending) — until real viewer identity lands, this is the first present `human` seat's
 *  `activePersonaId`, the correct proxy pre-multi-human (today's rooms carry exactly one human).
 *  `null` when no human participant is present (e.g. a fully-AI preview). */
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

/** Whether the VIEWING participant is the room host (drives the CONTEXT-panel host gate — task #28:
 *  host → full editing; member → read-only overrides + injections, preview hidden). Same "first present
 *  human seat" proxy as {@link resolveViewerActivePersonaId} (no client auth/session yet — task #50;
 *  today's rooms carry exactly one human, the owner, who is host). `false` when no human is present
 *  (a fully-AI preview) — the safe read-only floor, never a false host grant. When real viewer identity
 *  lands, this resolves against the authenticated participant instead of the first seat. */
export function resolveViewerIsHost(participants: readonly ParticipantView[]): boolean {
  for (const participant of participants) {
    if (participant.kind === "human") {
      return participant.role === "host";
    }
  }
  return false;
}
