// Unit: the room-level `MessageRenderContext` builder (features/chat/lib/message-render-context) —
// the DATA half of the macro DISPLAY pass (`#lib/message-render` is the ENGINE, reused unchanged).
// Pins: no roster/persona at all → `undefined` (content stays untouched, never a "" macro-erasure);
// a solo roster resolves `{{char}}`'s default; `{{user}}` always follows the ACTIVE persona, never a
// row's historical `personaId`; a non-character participant never counts toward the solo/group split
// (mirrors `attribution.ts`'s `isMultiCharacterRoom` discriminant).

import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PersonaAttribution } from "../../../../../packages/client/src/features/chat/lib/attribution";
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
    ...overrides,
  };
}

test("no roster and no persona threaded at all: undefined (never an empty-string erasure)", () => {
  const result = resolveMessageRenderContext({});
  expect(result).toBeUndefined();
});

test("a solo roster (one character) resolves {{char}}'s default name", () => {
  const participants = new Map([[ALICE_ID, makeParticipant({ displayName: "Alice" })]]);
  const result = resolveMessageRenderContext({ participants });
  expect(result?.characterName).toBe("Alice");
});

test("a multi-character roster degrades the default {{char}} name to empty (ambiguous, no guess)", () => {
  const participants = new Map([
    [ALICE_ID, makeParticipant({ characterId: ALICE_ID, displayName: "Alice" })],
    [BOB_ID, makeParticipant({ characterId: BOB_ID, displayName: "Bob" })],
  ]);
  const result = resolveMessageRenderContext({ participants });
  expect(result?.characterName).toBe("");
  // The retargeting map is still fully populated — a row with its own characterId still resolves.
  expect(result?.characterNamesById?.get(BOB_ID)).toBe("Bob");
});

test("a non-character participant never counts toward the solo/group split", () => {
  const participants = new Map<CharacterId, ParticipantView>([
    [ALICE_ID, makeParticipant({ characterId: ALICE_ID, displayName: "Alice" })],
    [BOB_ID, makeParticipant({ kind: "human", characterId: null, displayName: "Nate" })],
  ]);
  const result = resolveMessageRenderContext({ participants });
  // Still solo (one REAL character) despite two roster entries.
  expect(result?.characterName).toBe("Alice");
});

test("{{user}} resolves the chat's ACTIVE persona, not a row's historical personaId", () => {
  const personas = new Map<PersonaId, PersonaAttribution>([
    [NATE_PERSONA_ID, { name: "Nate", avatarAssetId: null }],
  ]);
  const result = resolveMessageRenderContext({ personas, activePersonaId: NATE_PERSONA_ID });
  expect(result?.userName).toBe("Nate");
});

test("a persona library with no active id set degrades {{user}} to empty", () => {
  const personas = new Map<PersonaId, PersonaAttribution>([
    [NATE_PERSONA_ID, { name: "Nate", avatarAssetId: null }],
  ]);
  const result = resolveMessageRenderContext({ personas, activePersonaId: null });
  expect(result?.userName).toBe("");
});

test("characterNamesById is omitted (not an empty Map) when no roster is threaded", () => {
  const personas = new Map<PersonaId, PersonaAttribution>([
    [NATE_PERSONA_ID, { name: "Nate", avatarAssetId: null }],
  ]);
  const result = resolveMessageRenderContext({ personas, activePersonaId: NATE_PERSONA_ID });
  expect(result?.characterNamesById).toBeUndefined();
});
