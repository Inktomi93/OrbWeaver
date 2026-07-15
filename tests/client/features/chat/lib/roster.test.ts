// Unit: the roster/viewer helpers (features/chat/lib/roster) — the pure wire-array→Map/id step the
// surface runs once per roster change. Pins: only `kind === "character"` participants (with a
// non-null `characterId`) land in the roster map (mirrors `attribution.ts`/`message-render-context.ts`'s
// identical discriminant); `resolveViewerActivePersonaId` proxies "the viewing participant" as the
// first present `human` seat (no client auth/session concept exists yet — Chat-Macro-Resolution.md §4).

import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import {
  buildParticipantsById,
  castSectionVisible,
  membersTabJustified,
  resolveHumanParticipants,
  resolveViewerActivePersonaId,
} from "../../../../../packages/client/src/features/chat/lib/roster";
import { expect, test } from "../../../../support/fixtures";
import { makeParticipant } from "./_support";

const ALICE_ID = castId<CharacterId>("char_alice_roster");
const BOB_ID = castId<CharacterId>("char_bob_roster");
const NATE_PERSONA_ID = castId<PersonaId>("persona_nate_roster");

test("buildParticipantsById keys character participants by their characterId", () => {
  const alice = makeParticipant({ characterId: ALICE_ID, displayName: "Alice" });
  const bob = makeParticipant({ characterId: BOB_ID, displayName: "Bob" });
  const byId = buildParticipantsById([alice, bob]);
  expect(byId.get(ALICE_ID)?.displayName).toBe("Alice");
  expect(byId.get(BOB_ID)?.displayName).toBe("Bob");
  expect(byId.size).toBe(2);
});

test("buildParticipantsById excludes non-character participants (human/agent/observer)", () => {
  const alice = makeParticipant({ characterId: ALICE_ID });
  const human = makeParticipant({ kind: "human", characterId: null, displayName: "Nate" });
  const byId = buildParticipantsById([alice, human]);
  expect(byId.size).toBe(1);
  expect(byId.has(ALICE_ID)).toBe(true);
});

test("buildParticipantsById excludes a character-kind row with a null characterId", () => {
  // A defensive edge the type technically allows but should never trust into the Map's key space.
  const malformed = makeParticipant({ kind: "character", characterId: null });
  const byId = buildParticipantsById([malformed]);
  expect(byId.size).toBe(0);
});

test("buildParticipantsById returns an empty map for an empty roster", () => {
  expect(buildParticipantsById([]).size).toBe(0);
});

test("resolveViewerActivePersonaId returns the first human participant's activePersonaId", () => {
  const human = makeParticipant({
    kind: "human",
    characterId: null,
    activePersonaId: NATE_PERSONA_ID,
  });
  expect(resolveViewerActivePersonaId([human])).toBe(NATE_PERSONA_ID);
});

test("resolveViewerActivePersonaId skips character/agent/observer participants", () => {
  const alice = makeParticipant({ characterId: ALICE_ID });
  const human = makeParticipant({
    kind: "human",
    characterId: null,
    activePersonaId: NATE_PERSONA_ID,
  });
  expect(resolveViewerActivePersonaId([alice, human])).toBe(NATE_PERSONA_ID);
});

test("resolveViewerActivePersonaId returns null when no human participant is present", () => {
  const alice = makeParticipant({ characterId: ALICE_ID });
  expect(resolveViewerActivePersonaId([alice])).toBeNull();
});

test("resolveViewerActivePersonaId returns null for an empty roster", () => {
  expect(resolveViewerActivePersonaId([])).toBeNull();
});

test("resolveHumanParticipants keeps only PRESENT human seats (characters + departed humans excluded)", () => {
  const alice = makeParticipant({ characterId: ALICE_ID });
  const host = makeParticipant({
    id: castId("participant_host"),
    kind: "human",
    characterId: null,
    role: "host",
    displayName: "Nate",
  });
  const departed = makeParticipant({
    id: castId("participant_left"),
    kind: "human",
    characterId: null,
    displayName: "Ghost",
    // leftSeq set = departed (kicked/left) — a historical row, not a room member.
    leftSeq: 12,
  });
  const humans = resolveHumanParticipants([alice, host, departed]);
  expect(humans.map((p) => p.displayName)).toEqual(["Nate"]);
});

test("resolveHumanParticipants returns [] for an all-character roster", () => {
  const alice = makeParticipant({ characterId: ALICE_ID });
  const bob = makeParticipant({ characterId: BOB_ID });
  expect(resolveHumanParticipants([alice, bob])).toEqual([]);
});

// ── castSectionVisible / membersTabJustified (the Members-tab floor gate, chats-section.tsx's
// declarative members `when`) ──

function humanParticipant(id: string): ReturnType<typeof makeParticipant> {
  return makeParticipant({ id: castId(id), kind: "human", characterId: null, displayName: id });
}

test("castSectionVisible: false under 2 characters, true at 2", () => {
  const alice = makeParticipant({ characterId: ALICE_ID });
  const bob = makeParticipant({ characterId: BOB_ID });
  expect(castSectionVisible([alice])).toBe(false);
  expect(castSectionVisible([alice, bob])).toBe(true);
});

test("membersTabJustified: castSectionVisible alone justifies the tab, multiHumanCapable or not", () => {
  const alice = makeParticipant({ characterId: ALICE_ID });
  const bob = makeParticipant({ characterId: BOB_ID });
  expect(membersTabJustified([alice, bob], false)).toBe(true);
  expect(membersTabJustified([alice, bob], true)).toBe(true);
});

test("membersTabJustified: 2+ humans justifies the tab ONLY when multiHumanCapable", () => {
  const humans = [humanParticipant("participant_h1"), humanParticipant("participant_h2")];
  expect(membersTabJustified(humans, true)).toBe(true);
  expect(membersTabJustified(humans, false)).toBe(false);
});

test("membersTabJustified: false when neither floor is met (solo character, single-user)", () => {
  const alice = makeParticipant({ characterId: ALICE_ID });
  expect(membersTabJustified([alice], false)).toBe(false);
  expect(membersTabJustified([alice], true)).toBe(false);
});
