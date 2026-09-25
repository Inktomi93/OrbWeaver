// The roster map builder — turns the chat roster wire array into the ReadonlyMap
// resolveRowAttribution/resolveMessageRenderContext consume, built once per roster change and read by
// every row, never re-resolved from body text. The macro-name producer is NOT built here;
// @orb/contracts/chat's own builders do that job directly (see message-list-surface.tsx).
//
// SUPERSEDED (wiring sprint #73): `resolveViewerActivePersonaId` — the client-side "first present human
// seat's activePersonaId" proxy — was removed. The server now computes the identical answer and ships it
// on `ChatDetail.viewerActivePersonaId` (domain/chat/substrate/chat-detail.ts:62, `viewer?.activePersonaId
// ?? null`), read live at message-list-surface.tsx (`chatDetail.viewerActivePersonaId`). Re-deriving it
// client-side from the roster array was residue from before that field shipped.

import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";

// Omit, not a same-key intersection — a known TS assignability footgun that gets harder to prove as
// ParticipantView grows optional fields, silently losing the .filter narrow.
type CharacterParticipant = Omit<ParticipantView, "characterId"> & {
  readonly characterId: NonNullable<ParticipantView["characterId"]>;
};

function isCharacter(p: ParticipantView): p is CharacterParticipant {
  return p.kind === "character" && p.characterId !== null;
}

export function filterCharacters(participants: readonly ParticipantView[]): readonly CharacterParticipant[] {
  return participants.filter(isCharacter);
}

/** The room's members: the PRESENT humans. A member is a person, the word the invite preview counts with; the
 *  characters are the Characters section, and a departed seat is gone. */
export function presentMemberCount(participants: readonly ParticipantView[]): number {
  return participants.filter((p) => p.kind === "human" && p.leftSeq === null).length;
}

export function buildParticipantsById(participants: readonly ParticipantView[]): ReadonlyMap<CharacterId, ParticipantView> {
  const byId = new Map<CharacterId, ParticipantView>();
  for (const participant of participants) {
    if (participant.kind === "character" && participant.characterId !== null) {
      byId.set(participant.characterId, participant);
    }
  }
  return byId;
}

// leftSeq === null is the present-and-contributing predicate — a kicked/left human keeps a historical
// row but must not render as a room member.
export function resolveHumanParticipants(participants: readonly ParticipantView[]): readonly ParticipantView[] {
  return participants.filter((p) => p.kind === "human" && p.leftSeq === null);
}

export function resolveIsGroupChat(participants: readonly ParticipantView[]): boolean {
  return buildParticipantsById(participants).size > 1;
}

const CHARACTER_SECTION_FLOOR = 1;
const PEOPLE_TAB_FLOOR = 2;

/** The Members tab's Characters section floor — ANY character in the room earns the list.
 *
 *  ⚠️ IT WAS 2, AND THAT HID THE WHOLE ROSTER IN EVERY 1:1 ROOM. The Members tab is the room's roster
 *  surface, so a solo chat — the overwhelmingly common shape — rendered a tab containing nothing but the
 *  viewer's own People row, which is exactly the "Chat Members lost detail" the owner reported (#162,
 *  2026-08-17: "it used to show … the characters in the room, now it just shows my email"). The old floor was
 *  written as a DISPLAY rule ("don't show a Characters list of one") and was silently doing duty as an ACCESS rule:
 *  it also withheld every per-character control (mute, talkativeness, summon, view card, remove) and — since
 *  the add-character door now lives in this section's header — the only in-tab way to ADD a character. The
 *  identical mistake, with the identical shape, as the People floor's host arm below.
 *
 *  NARROWED ONCE, AND ONLY OUTSIDE THIS FUNCTION (#182, owner live report 2026-08-18 — "some group stuff is
 *  showing up even when not in group"). Three of the controls this floor used to hide are inputs to the GROUP
 *  SPEAKER ARBITER (mute · talkativeness · "make X speak next"), and un-hiding them put arbitration chrome in
 *  every 1:1 room. `committed-members-tab.tsx` now gates those three on {@link resolveIsGroupChat} — the
 *  SECTION floor above stays ZERO, which is what the #162 ruling was about. Read both comments together
 *  before touching either: the roster is not a group affordance, the arbiter's knobs are.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function charactersSectionVisible(participants: readonly ParticipantView[]): boolean {
  return filterCharacters(participants).length >= CHARACTER_SECTION_FLOOR;
}

/**
 * The Members tab's floor gate (chats-section.tsx's members `when`).
 *
 * THE FLOOR IS ZERO FOR A HOST (owner-ruled 2026-08-18 via #162): a committed room ALWAYS has a roster, the
 * Members tab is its ONE home, and every state that used to hide the tab now has real content — the room's
 * characters, or the empty state plus the add/invite doors. This is the third time this gate has been narrowed
 * into an ACCESS rule while written as a DISPLAY rule, and each narrowing hid a door that lives nowhere else:
 *
 *   • \>=2 HUMANS (found 2026-08-03, first real multi-user test) — "Invite people" lives ONLY in this tab, so
 *     you needed a second human to see the tab and the tab was the only way to invite one. A deadlock.
 *   • \>=2 CHARACTERS (found 2026-08-17, owner dogfood) — a 1:1 room's whole Characters section vanished, taking
 *     every per-character control with it: "it used to show … the characters in the room, now it just shows
 *     my email". THE SUPERSESSION THAT KILLED THE TOPBAR POPOVER: `chat-header.tsx` carried a whole second
 *     roster surface (`SoloRosterMenu`, with its own add-character door) built for exactly the rooms this
 *     floor hid. The floor died; the popover died with it (chat-header's header records the reversal).
 *
 * A non-host with nothing to see — no characters, and no People arm — still gets no tab: an empty pane with no
 * affordance in it is the one state worth hiding.
 */
export function membersTabJustified(participants: readonly ParticipantView[], multiHumanCapable: boolean, isHost = false): boolean {
  const humans = resolveHumanParticipants(participants).length;
  const peopleJustifies = multiHumanCapable && (isHost || humans >= PEOPLE_TAB_FLOOR);
  // The HOST arm is unconditional: they can always add a character, which is the tab's own empty state.
  return isHost || peopleJustifies || charactersSectionVisible(participants);
}
