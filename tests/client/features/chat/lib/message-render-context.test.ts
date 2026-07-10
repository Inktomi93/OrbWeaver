// Unit: the room-level `MessageRenderContext` builder (features/chat/lib/message-render-context) —
// the DATA half of the macro DISPLAY pass (`#lib/message-render` is the ENGINE, reused unchanged; it
// wraps `@orb/kit/macro`'s `resolveRowMacros`, the ONE atom server ASSEMBLE also calls). Pins: the
// producer maps pass straight through; a solo roster resolves `{{char}}`'s `speakerCharName` default; a
// non-character participant never counts toward the solo/group split (mirrors `attribution.ts`'s
// `isMultiCharacterRoom` discriminant); `fallbackPersonaName` resolves the chat ANCHOR persona id against
// the producer — the null-stamp `{{user}}`/`{{persona}}` fallback (ruling A / the design principle: NEVER
// the viewer's own active persona), never a row's own `personaId` (that retarget rides `resolveRowMacros`'s
// per-row stamps); `cast` = the full character roster in order (ruling B: a user/narrator row's `{{char}}`).
// Never returns `undefined` — the kit atom's own literal floors mean an empty producer never erases a word.

import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { resolveMessageRenderContext } from "../../../../../packages/client/src/features/chat/lib/message-render-context";
import { expect, test } from "../../../../support/fixtures";

const ALICE_ID = castId<CharacterId>("char_alice_render");
const BOB_ID = castId<CharacterId>("char_bob_render");
const NATE_PERSONA_ID = castId<PersonaId>("persona_nate_render");

function makeParticipant(overrides: Partial<ParticipantView> = {}): ParticipantView {
  return {
    id: castId("participant_1"),
    chatId: castId("chat_1"),
    kind: "character",
    userId: null,
    characterId: ALICE_ID,
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

const EMPTY_CHARACTER_NAMES: ReadonlyMap<CharacterId, RowCharacterName> = new Map<
  CharacterId,
  RowCharacterName
>();
const EMPTY_PERSONA_NAMES: ReadonlyMap<PersonaId, RowPersonaName> = new Map<
  PersonaId,
  RowPersonaName
>();

test("no roster/producer threaded at all: a defined context with empty producer maps (never undefined)", () => {
  const result = resolveMessageRenderContext({
    characterNamesById: EMPTY_CHARACTER_NAMES,
    personaNamesById: EMPTY_PERSONA_NAMES,
  });
  expect(result.characterNamesById.size).toBe(0);
  expect(result.personaNamesById.size).toBe(0);
  expect(result.speakerCharName).toBeUndefined();
  expect(result.fallbackPersonaName).toBeUndefined();
});

test("a solo roster (one character) resolves {{char}}'s speakerCharName default", () => {
  const participants = new Map([[ALICE_ID, makeParticipant({ displayName: "Alice" })]]);
  const result = resolveMessageRenderContext({
    participants,
    characterNamesById: EMPTY_CHARACTER_NAMES,
    personaNamesById: EMPTY_PERSONA_NAMES,
  });
  expect(result.speakerCharName).toBe("Alice");
});

test("a multi-character roster omits speakerCharName (ambiguous, no guess) but keeps the producer intact", () => {
  const participants = new Map([
    [ALICE_ID, makeParticipant({ characterId: ALICE_ID, displayName: "Alice" })],
    [BOB_ID, makeParticipant({ characterId: BOB_ID, displayName: "Bob" })],
  ]);
  const characterNamesById = new Map<CharacterId, RowCharacterName>([[BOB_ID, { name: "Bob" }]]);
  const result = resolveMessageRenderContext({
    participants,
    characterNamesById,
    personaNamesById: EMPTY_PERSONA_NAMES,
  });
  expect(result.speakerCharName).toBeUndefined();
  // The producer map is still fully populated — a row with its own characterId still resolves.
  expect(result.characterNamesById.get(BOB_ID)?.name).toBe("Bob");
  // Ruling B: the full cast (roster order) IS exposed — a user/narrator row's {{char}} joins it.
  expect(result.cast).toEqual(["Alice", "Bob"]);
});

test("a non-character participant never counts toward the solo/group split", () => {
  const participants = new Map<CharacterId, ParticipantView>([
    [ALICE_ID, makeParticipant({ characterId: ALICE_ID, displayName: "Alice" })],
    [BOB_ID, makeParticipant({ kind: "human", characterId: null, displayName: "Alex" })],
  ]);
  const result = resolveMessageRenderContext({
    participants,
    characterNamesById: EMPTY_CHARACTER_NAMES,
    personaNamesById: EMPTY_PERSONA_NAMES,
  });
  // Still solo (one REAL character) despite two roster entries.
  expect(result.speakerCharName).toBe("Alice");
});

test("fallbackPersonaName + description resolve the chat ANCHOR persona id against the producer", () => {
  const personaNamesById = new Map<PersonaId, RowPersonaName>([
    [NATE_PERSONA_ID, { name: "Alex", description: "the pinned host POV" }],
  ]);
  const result = resolveMessageRenderContext({
    characterNamesById: EMPTY_CHARACTER_NAMES,
    personaNamesById,
    anchorPersonaId: NATE_PERSONA_ID,
  });
  // The null-stamp {{user}}/{{persona}} fallback is the ANCHOR (ruling A) — never the viewer's own persona.
  expect(result.fallbackPersonaName).toBe("Alex");
  expect(result.fallbackPersonaDescription).toBe("the pinned host POV");
});

test("no anchor persona id set: fallbackPersonaName stays undefined (kit's own floor applies later)", () => {
  const personaNamesById = new Map<PersonaId, RowPersonaName>([
    [NATE_PERSONA_ID, { name: "Alex", description: "" }],
  ]);
  const result = resolveMessageRenderContext({
    characterNamesById: EMPTY_CHARACTER_NAMES,
    personaNamesById,
    anchorPersonaId: null,
  });
  expect(result.fallbackPersonaName).toBeUndefined();
});

test("an anchor persona id absent from the producer degrades to undefined, not a crash", () => {
  const unknownId = castId<PersonaId>("persona_unknown");
  const result = resolveMessageRenderContext({
    characterNamesById: EMPTY_CHARACTER_NAMES,
    personaNamesById: EMPTY_PERSONA_NAMES,
    anchorPersonaId: unknownId,
  });
  expect(result.fallbackPersonaName).toBeUndefined();
});
