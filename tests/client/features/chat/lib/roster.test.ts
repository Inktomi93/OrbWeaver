// Unit: the roster/viewer helpers (features/chat/lib/roster) — the pure wire-array→Map/id step the
// surface runs once per roster change. Pins: only `kind === "character"` participants (with a
// non-null `characterId`) land in the roster map (mirrors `attribution.ts`/`message-render-context.ts`'s
// identical discriminant); `resolveViewerActivePersonaId` proxies "the viewing participant" as the
// first present `human` seat (no client auth/session concept exists yet — Chat-Macro-Resolution.md §4).

import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import {
  buildParticipantsById,
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
