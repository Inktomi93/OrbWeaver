// Unit: per-row attribution resolution (features/chat/lib/attribution, #21 §12.4). Pins the trust
// rules: assistant rows resolve `characterId` against the per-chat macro-name PRODUCER (the SAME map
// the row's `{{char}}` macro reads); a null `characterId` in a multi-character room is "Narrator"
// (never `participants[0]`); user rows resolve `personaId` against the producer, falling back to the
// viewing participant's active persona for legacy rows; everything else renders no chrome.

import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { resolveRowMacros } from "@orb/kit/macro";
import {
  initialsForAttribution,
  resolveRoomTheme,
  resolveRowAttribution,
  speakerThemesByName,
} from "../../../../../packages/client/src/features/chat/lib/attribution";
import { expect, test } from "../../../../support/fixtures";

const ALICE_ID = castId<CharacterId>("char_alice");
const BOB_ID = castId<CharacterId>("char_bob");
const NATE_PERSONA_ID = castId<PersonaId>("persona_nate");

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

test("assistant row with no roster/producer threaded gets no attribution chrome (solo-chat default)", () => {
  const result = resolveRowAttribution({
    role: "assistant",
    characterId: ALICE_ID,
    personaId: null,
  });
  expect(result).toEqual({
    name: null,
    kind: null,
    avatarAssetId: null,
    avatarHash: null,
    hueSeed: "",
    tokens: null,
  });
});

test("assistant row resolves name from the producer + avatar/color from the roster by characterId", () => {
  const participants = new Map([
    [ALICE_ID, makeParticipant({ displayName: "Alice", avatarHash: "hash_alice" })],
  ]);
  const characterNamesById = new Map<CharacterId, RowCharacterName>([
    [ALICE_ID, { name: "Alice" }],
  ]);
  const result = resolveRowAttribution({
    role: "assistant",
    characterId: ALICE_ID,
    personaId: null,
    participants,
    characterNamesById,
  });
  expect(result.name).toBe("Alice");
  expect(result.kind).toBe("character"); // §A.8 KIND-READY
  expect(result.avatarHash).toBe("hash_alice");
  expect(result.tokens).not.toBeNull();
});

test("a characterId absent from the producer gets no chrome (not a crash, not char[0])", () => {
  const characterNamesById = new Map<CharacterId, RowCharacterName>([
    [ALICE_ID, { name: "Alice" }],
  ]);
  const result = resolveRowAttribution({
    role: "assistant",
    characterId: BOB_ID,
    personaId: null,
    characterNamesById,
  });
  expect(result).toEqual({
    name: null,
    kind: null,
    avatarAssetId: null,
    avatarHash: null,
    hueSeed: "",
    tokens: null,
  });
});

test("null characterId in a MULTI-character room resolves to a neutral Narrator", () => {
  const participants = new Map([
    [ALICE_ID, makeParticipant({ characterId: ALICE_ID, displayName: "Alice" })],
    [BOB_ID, makeParticipant({ characterId: BOB_ID, displayName: "Bob" })],
  ]);
  const result = resolveRowAttribution({
    role: "assistant",
    characterId: null,
    personaId: null,
    participants,
  });
  expect(result.name).toBe("Narrator");
  expect(result.kind).toBe("character"); // §A.8 KIND-READY — narrator is still the character side
  expect(result.tokens).toBeNull();
});

test("null characterId in a SOLO room (one character participant) gets no chrome, not Narrator", () => {
  const participants = new Map([[ALICE_ID, makeParticipant({ characterId: ALICE_ID })]]);
  const result = resolveRowAttribution({
    role: "assistant",
    characterId: null,
    personaId: null,
    participants,
  });
  expect(result).toEqual({
    name: null,
    kind: null,
    avatarAssetId: null,
    avatarHash: null,
    hueSeed: "",
    tokens: null,
  });
});

test("a non-character participant (human/agent/observer) never counts toward multi-character", () => {
  const humanParticipant = makeParticipant({
    kind: "human",
    characterId: null,
    displayName: "Nate",
  });
  const participants = new Map<CharacterId, ParticipantView>([
    [ALICE_ID, makeParticipant({ characterId: ALICE_ID })],
    // Keyed distinctly even though this participant's own characterId is null — the map key here
    // is arbitrary in the test; only `kind` drives the multi-character count.
    [BOB_ID, humanParticipant],
  ]);
  const result = resolveRowAttribution({
    role: "assistant",
    characterId: null,
    personaId: null,
    participants,
  });
  expect(result.name).toBeNull();
});

test("user row resolves the message's own personaId against the producer", () => {
  const personaNamesById = new Map<PersonaId, RowPersonaName>([
    [NATE_PERSONA_ID, { name: "Nate", description: "" }],
  ]);
  const result = resolveRowAttribution({
    role: "user",
    characterId: null,
    personaId: NATE_PERSONA_ID,
    personaNamesById,
  });
  expect(result.name).toBe("Nate");
  expect(result.kind).toBe("persona"); // §A.8 KIND-READY
  expect(result.tokens).toBeNull();
  // `avatarAssetId` stays null for a user row (the field is character-only); the IMAGE comes from the
  // separate `personaAvatarsById` producer — absent here, so it degrades to initials.
  expect(result.avatarAssetId).toBeNull();
  expect(result.avatarHash).toBeNull();
});

test("user row resolves the avatar HASH from the separate personaAvatarsById producer (#67)", () => {
  const personaNamesById = new Map<PersonaId, RowPersonaName>([
    [NATE_PERSONA_ID, { name: "Nate", description: "" }],
  ]);
  const personaAvatarsById = new Map<PersonaId, string | null>([[NATE_PERSONA_ID, "hash_nate"]]);
  const result = resolveRowAttribution({
    role: "user",
    characterId: null,
    personaId: NATE_PERSONA_ID,
    personaNamesById,
    personaAvatarsById,
  });
  expect(result.name).toBe("Nate");
  expect(result.avatarHash).toBe("hash_nate");
});

test("user row with a null personaId falls back to the viewing participant's active persona (legacy rows)", () => {
  const personaNamesById = new Map<PersonaId, RowPersonaName>([
    [NATE_PERSONA_ID, { name: "Nate", description: "" }],
  ]);
  const result = resolveRowAttribution({
    role: "user",
    characterId: null,
    personaId: null,
    personaNamesById,
    activePersonaId: NATE_PERSONA_ID,
  });
  expect(result.name).toBe("Nate");
});

test("user row with NO persona selected labels 'You' (the viewer's own row is never bare)", () => {
  const result = resolveRowAttribution({
    role: "user",
    characterId: null,
    personaId: null,
    personaNamesById: new Map<PersonaId, RowPersonaName>(), // nothing resolves — no persona exists
  });
  expect(result.name).toBe("You");
  expect(result.kind).toBe("persona"); // §A.8 KIND-READY — "You" is still the persona side
  expect(result.avatarAssetId).toBeNull();
  expect(result.tokens).toBeNull();
});

// ── C5 (#59 §6 parity lock), client side: after a reattribution changes the row's `personaId` stamp (the
//    post-mutation refetch), BOTH the #21 badge AND the {{user}} macro re-resolve to the NEW persona off the
//    SAME stamp + the SAME producer — no UI needed, just the pure render path. Twin of the server C5 test. ──
test("C5 client: a changed personaId stamp re-resolves BOTH the badge and {{user}} to the new persona", () => {
  const mara = castId<PersonaId>("persona_mara");
  const zara = castId<PersonaId>("persona_zara");
  const personaNamesById = new Map<PersonaId, RowPersonaName>([
    [mara, { name: "Mara", description: "" }],
    [zara, { name: "Zara", description: "" }],
  ]);
  const macroCtx = {
    characterNamesById: new Map<CharacterId, RowCharacterName>(),
    personaNamesById,
  };

  // Before reattribution: the row is stamped Mara. The viewer's CURRENT persona is Zara — it must NOT win
  // over the row's own stamp (that's the whole point of the per-message stamp).
  const badgeBefore = resolveRowAttribution({
    role: "user",
    characterId: null,
    personaId: mara,
    personaNamesById,
    activePersonaId: zara,
  });
  expect(badgeBefore.name).toBe("Mara");
  expect(resolveRowMacros("{{user}} waves", { characterId: null, personaId: mara }, macroCtx)).toBe(
    "Mara waves",
  );

  // After reattribution the refetched row carries personaId = Zara → badge + macro both flip to Zara.
  const badgeAfter = resolveRowAttribution({
    role: "user",
    characterId: null,
    personaId: zara,
    personaNamesById,
    activePersonaId: zara,
  });
  expect(badgeAfter.name).toBe("Zara");
  expect(resolveRowMacros("{{user}} waves", { characterId: null, personaId: zara }, macroCtx)).toBe(
    "Zara waves",
  );
});

test("the message's OWN personaId wins over the active persona (historical author, not current)", () => {
  const oldPersonaId = castId<PersonaId>("persona_old");
  const personaNamesById = new Map<PersonaId, RowPersonaName>([
    [oldPersonaId, { name: "Old Persona", description: "" }],
    [NATE_PERSONA_ID, { name: "Nate", description: "" }],
  ]);
  const result = resolveRowAttribution({
    role: "user",
    characterId: null,
    personaId: oldPersonaId,
    personaNamesById,
    activePersonaId: NATE_PERSONA_ID,
  });
  expect(result.name).toBe("Old Persona");
});

test("system rows never get attribution chrome", () => {
  const result = resolveRowAttribution({ role: "system", characterId: null, personaId: null });
  expect(result).toEqual({
    name: null,
    kind: null,
    avatarAssetId: null,
    avatarHash: null,
    hueSeed: "",
    tokens: null,
  });
});

test("initials take the first letter of up to two words", () => {
  expect(initialsForAttribution("Alice Smith")).toBe("AS");
  expect(initialsForAttribution("Bob")).toBe("B");
  expect(initialsForAttribution("   ")).toBe("?");
});

const HEARTH_TOKENS = { accent: "oklch(0.7 0.14 250)" };

test("Layer 3: an assistant row uses the character's authored themeOverride when present", () => {
  const participants = new Map([
    [ALICE_ID, makeParticipant({ displayName: "Alice", themeOverride: HEARTH_TOKENS })],
  ]);
  const characterNamesById = new Map<CharacterId, RowCharacterName>([
    [ALICE_ID, { name: "Alice" }],
  ]);
  const result = resolveRowAttribution({
    role: "assistant",
    characterId: ALICE_ID,
    personaId: null,
    participants,
    characterNamesById,
  });
  expect(result.tokens).toEqual(HEARTH_TOKENS);
});

test("Layer 2: resolveRoomTheme applies the sole character's override only in a TRUE-SOLO room", () => {
  const human = makeParticipant({ kind: "human", characterId: null, displayName: "Nate" });
  const alice = makeParticipant({
    characterId: ALICE_ID,
    displayName: "Alice",
    themeOverride: HEARTH_TOKENS,
  });
  const bob = makeParticipant({ characterId: BOB_ID, displayName: "Bob" });
  // Exactly one human + one character → takeover.
  expect(resolveRoomTheme([human, alice])).toEqual(HEARTH_TOKENS);
  // A second character (group) → no takeover.
  expect(resolveRoomTheme([human, alice, bob])).toBeUndefined();
  // A second human → no takeover (each human keeps their own theme).
  const human2 = makeParticipant({ kind: "human", characterId: null, displayName: "Sam" });
  expect(resolveRoomTheme([human, human2, alice])).toBeUndefined();
  // An observer (another human viewer) → no takeover.
  const observer = makeParticipant({ kind: "observer", characterId: null, displayName: "Watcher" });
  expect(resolveRoomTheme([human, alice, observer])).toBeUndefined();
  expect(resolveRoomTheme(undefined)).toBeUndefined();
});

test("Layer 3 spans: speakerThemesByName maps a character's NAME to its override", () => {
  const participants = new Map([
    [ALICE_ID, makeParticipant({ displayName: "Alice", themeOverride: HEARTH_TOKENS })],
    [BOB_ID, makeParticipant({ characterId: BOB_ID, displayName: "Bob" })], // no override → omitted
  ]);
  const byName = speakerThemesByName(participants);
  expect(byName.get("Alice")).toEqual(HEARTH_TOKENS);
  expect(byName.has("Bob")).toBe(false);
});
