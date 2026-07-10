// Shared scaffolding for the chat/lib node-lane tests — the `ParticipantView` literal hand-rolled
// identically in attribution/roster/message-render-context.test.ts (13 fields, `kind: "character"`
// default). Every consumer passes explicit overrides for the fields it cares about (no test relies on
// the bare default `characterId`), so one shared default id is safe here.
import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

const DEFAULT_CHARACTER_ID = castId<CharacterId>("char_default");

/** A `ParticipantView` seeded with a solo-character default, `overrides` applied on top. */
export function makeParticipant(overrides: Partial<ParticipantView> = {}): ParticipantView {
  return {
    id: castId("participant_1"),
    chatId: castId("chat_1"),
    kind: "character",
    userId: null,
    characterId: DEFAULT_CHARACTER_ID,
    role: "member",
    activePersonaId: null,
    talkativeness: 1,
    disabled: false,
    joinedAt: 0,
    joinSeq: 0,
    leftSeq: null,
    joinHistoryVisibility: "full",
    displayName: "Alice",
    handle: null,
    avatarAssetId: null,
    avatarHash: null,
    ...overrides,
  };
}
