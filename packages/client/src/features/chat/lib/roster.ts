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
import type { CharacterId, PersonaId, UserId } from "@orb/kit/ids";

/** A character participant — narrowed from the roster (a human/agent/observer seat has no place here).
 *  `Omit` (not a same-key intersection — a known TS assignability footgun that gets harder for the
 *  checker to prove as `ParticipantView` grows optional fields, silently losing the `.filter` narrow).
 *  NOT exported (`no-inline-types` — feature types live in `contract/`, not a feature `lib/`); consumers
 *  needing the narrowed element type derive it locally via `ReturnType<typeof filterCharacters>[number]`. */
type CharacterParticipant = Omit<ParticipantView, "characterId"> & {
  readonly characterId: NonNullable<ParticipantView["characterId"]>;
};

function isCharacter(p: ParticipantView): p is CharacterParticipant {
  return p.kind === "character" && p.characterId !== null;
}

/** The character-only slice of a roster — the ONE narrowing filter (was copied verbatim across
 *  chat-header/chat-cast-bar/speak-as-select + inlined in the context panel). */
export function filterCharacters(
  participants: readonly ParticipantView[],
): readonly CharacterParticipant[] {
  return participants.filter(isCharacter);
}

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

/** The VIEWING participant's user id — the "own-authored content" signal for the D44 §12.0 render-trust
 *  rule (a `role==="user"` message whose `authorUserId` matches is the viewer's OWN, hence trusted). Same
 *  "first present `human` seat" proxy as {@link resolveViewerActivePersonaId} (no client auth/session yet —
 *  task #50; today's rooms carry exactly one human). `null` when no human is present — the safe floor:
 *  with no resolvable viewer, NO message matches "own-authored", so everything stays untrusted (fail
 *  closed). When real viewer identity lands (#50), this resolves against the authenticated principal. */
export function resolveViewerUserId(participants: readonly ParticipantView[]): UserId | null {
  for (const participant of participants) {
    if (participant.kind === "human") {
      return participant.userId;
    }
  }
  return null;
}

/** The PRESENT human seats (multi-human invites lane) — the "People" section's rows, differentiated
 *  from the seated cast (`buildParticipantsById`'s character filter). `leftSeq === null` is the
 *  "present-and-contributing" predicate (`ParticipantView` header): a kicked/left human keeps a
 *  historical row but must not render as a room member. */
export function resolveHumanParticipants(
  participants: readonly ParticipantView[],
): readonly ParticipantView[] {
  return participants.filter((p) => p.kind === "human" && p.leftSeq === null);
}

/** Whether this room is a real GROUP (more than 1 character participant) — the D16 "roster-of-1 is degenerate,
 *  not an `isGroup` branch" gate: mute/talkativeness/force-turn are meaningless with one character, so
 *  the CONTEXT-panel Roster tab (group controls) must NOT appear for a solo chat, mirroring
 *  `ChatCastBar`'s identical `cast.length <= 1 → null` size-gate (chat-cast-bar.tsx) — same filter,
 *  same threshold, so the tab and the glance strip agree on solo-vs-group for the same roster. */
export function resolveIsGroupChat(participants: readonly ParticipantView[]): boolean {
  return buildParticipantsById(participants).size > 1;
}
