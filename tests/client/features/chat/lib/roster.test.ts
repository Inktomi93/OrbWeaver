// Unit: the roster/viewer helpers (features/chat/lib/roster) — the pure wire-array→Map/id step the
// surface runs once per roster change. Pins: only `kind === "character"` participants (with a
// non-null `characterId`) land in the roster map (mirrors `attribution.ts`/`message-render-context.ts`'s
// identical discriminant). `resolveViewerActivePersonaId` was removed (wiring sprint #73) — superseded by
// the server-computed `ChatDetail.viewerActivePersonaId` (see roster.ts's header).

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import {
  buildParticipantsById,
  castSectionVisible,
  membersTabJustified,
  resolveHumanParticipants,
} from "../../../../../packages/client/src/features/chat/lib/roster.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeParticipant } from "./_support.ts";

const ALICE_ID = castId<CharacterId>("char_alice_roster");
const BOB_ID = castId<CharacterId>("char_bob_roster");

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
  const human = makeParticipant({ kind: "human", characterId: null, displayName: "Alex" });
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

test("resolveHumanParticipants keeps only PRESENT human seats (characters + departed humans excluded)", () => {
  const alice = makeParticipant({ characterId: ALICE_ID });
  const host = makeParticipant({
    id: castId("participant_host"),
    kind: "human",
    characterId: null,
    role: "host",
    displayName: "Alex",
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
  expect(humans.map((p) => p.displayName)).toEqual(["Alex"]);
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

// THE #162 REGRESSION (owner-observed 2026-08-17). The floor was 2, so a 1:1 room — the common shape —
// rendered a Members tab with NO cast section at all: no character rows, no per-character controls, and
// (since the add-character door now lives in that section's header) no way to grow the cast from the tab.
// "It used to show … the characters in the room, now it just shows my email."
test("castSectionVisible: ANY character in the room earns the Cast list", () => {
  const alice = makeParticipant({ characterId: ALICE_ID });
  const bob = makeParticipant({ characterId: BOB_ID });
  expect(castSectionVisible([])).toBe(false);
  expect(castSectionVisible([alice])).toBe(true);
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

test("membersTabJustified: a SOLO-character room reaches the tab — its cast IS the roster (#162)", () => {
  const alice = makeParticipant({ characterId: ALICE_ID });
  expect(membersTabJustified([alice], false)).toBe(true);
  expect(membersTabJustified([alice], true)).toBe(true);
});

test("membersTabJustified: false when the room has NO cast and no People arm", () => {
  const solo = [humanParticipant("participant_h1")];
  expect(membersTabJustified(solo, false)).toBe(false);
  expect(membersTabJustified(solo, true)).toBe(false);
});

// THE DEADLOCK REGRESSION (2026-08-03, found on the first real multi-user test). "Invite people" lives
// ONLY inside the Members tab, so gating that tab on >=2 humans made multi-human unreachable: you needed
// a second human to see the tab, and the tab was the only way to invite one. A HOST on a multi-human
// install must always reach it.
test("membersTabJustified: a HOST reaches the tab with ONE human — the invite affordance lives there", () => {
  const solo = [humanParticipant("participant_h1")];
  // the deadlock: host, multi-human install, one human, no second character
  expect(membersTabJustified(solo, true, true)).toBe(true);
  // a lone character alongside the host must not change the verdict (this is the real shape of a fresh chat)
  expect(membersTabJustified([...solo, makeParticipant({ characterId: ALICE_ID })], true, true)).toBe(true);
});

// FLOOR ZERO FOR A HOST (owner ruling 2026-08-18, #162). This used to assert that a single-user host with
// one human and no cast got NO tab — the arm "stayed shut" because there was nobody to invite. That is the
// same display-rule-doing-access-work mistake in a third costume: a host with no cast still has the
// add-character door, and that door lives in this tab. A NON-host with nothing to see keeps the floor.
test("membersTabJustified: a HOST always reaches the tab; a non-host with nothing in it does not", () => {
  const solo = [humanParticipant("participant_h1")];
  // single-user install, no cast: the host still has the add-character door, which lives ONLY in this tab
  expect(membersTabJustified(solo, false, true)).toBe(true);
  // non-host, nothing to see and nothing to do ⇒ still no tab
  expect(membersTabJustified(solo, true, false)).toBe(false);
  // and the default (omitted) is non-host, so existing callers are unchanged
  expect(membersTabJustified(solo, true)).toBe(false);
});
