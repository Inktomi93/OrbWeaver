// Unit: per-row attribution resolution (features/chat/lib/attribution, #21 §12.4). Pins the trust
// rules: assistant rows resolve `characterId` against the per-chat macro-name PRODUCER (the SAME map
// the row's `{{char}}` macro reads); a null `characterId` in a multi-character room is "Narrator"
// (never `participants[0]`); user rows resolve `personaId` against the producer, falling back to the
// viewing participant's active persona for legacy rows; everything else renders no chrome.

import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { resolveRowMacros } from "@orb/kit/macro";
import { resolveRoomTheme, resolveRowAttribution, speakerThemesByName } from "../../../../../packages/client/src/features/chat/lib/attribution";
import { colorForCharacter } from "../../../../../packages/client/src/features/chat/lib/speaker-color";
import { expect, test } from "../../../../support/fixtures";
import { makeParticipant } from "./_support";

const ALICE_ID = castId<CharacterId>("char_alice");
const BOB_ID = castId<CharacterId>("char_bob");
const NATE_PERSONA_ID = castId<PersonaId>("persona_nate");

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
  const participants = new Map([[ALICE_ID, makeParticipant({ displayName: "Alice", avatarHash: "hash_alice" })]]);
  const characterNamesById = new Map<CharacterId, RowCharacterName>([[ALICE_ID, { name: "Alice" }]]);
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

// P2 transcript-integrity (side-eye 2026-07-25): a character REMOVED from the room keeps its historical
// rows, so its `ParticipantView` is gone but `characterNamesById` still resolves the name. Before the fix
// the avatar keyed ONLY off the (now-absent) participant → the portrait degraded to bare initials. The
// character-avatar producer is the participant-independent floor that keeps the portrait.
test("assistant row of a REMOVED character keeps its portrait from the character-avatar producer (not the absent participant)", () => {
  // No participant for Alice — she was removed; only her name + character-avatar producer entries survive.
  const characterNamesById = new Map<CharacterId, RowCharacterName>([[ALICE_ID, { name: "Alice" }]]);
  const characterAvatarsById = new Map<CharacterId, string | null>([[ALICE_ID, "hash_alice"]]);
  const result = resolveRowAttribution({
    role: "assistant",
    characterId: ALICE_ID,
    personaId: null,
    participants: new Map<CharacterId, ParticipantView>(),
    characterNamesById,
    characterAvatarsById,
  });
  expect(result.name).toBe("Alice");
  expect(result.avatarHash).toBe("hash_alice");
});

test("the live participant's avatarHash WINS over the character-avatar producer (per-chat override survives)", () => {
  const participants = new Map([[ALICE_ID, makeParticipant({ displayName: "Alice", avatarHash: "hash_participant_override" })]]);
  const characterNamesById = new Map<CharacterId, RowCharacterName>([[ALICE_ID, { name: "Alice" }]]);
  const characterAvatarsById = new Map<CharacterId, string | null>([[ALICE_ID, "hash_character_level"]]);
  const result = resolveRowAttribution({
    role: "assistant",
    characterId: ALICE_ID,
    personaId: null,
    participants,
    characterNamesById,
    characterAvatarsById,
  });
  expect(result.avatarHash).toBe("hash_participant_override");
});

test("a characterId absent from the producer gets no chrome (not a crash, not char[0])", () => {
  const characterNamesById = new Map<CharacterId, RowCharacterName>([[ALICE_ID, { name: "Alice" }]]);
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
  const personaNamesById = new Map<PersonaId, RowPersonaName>([[NATE_PERSONA_ID, { name: "Nate", description: "" }]]);
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
  const personaNamesById = new Map<PersonaId, RowPersonaName>([[NATE_PERSONA_ID, { name: "Nate", description: "" }]]);
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
  const personaNamesById = new Map<PersonaId, RowPersonaName>([[NATE_PERSONA_ID, { name: "Nate", description: "" }]]);
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
  expect(resolveRowMacros("{{user}} waves", { characterId: null, personaId: mara }, macroCtx)).toBe("Mara waves");

  // After reattribution the refetched row carries personaId = Zara → badge + macro both flip to Zara.
  const badgeAfter = resolveRowAttribution({
    role: "user",
    characterId: null,
    personaId: zara,
    personaNamesById,
    activePersonaId: zara,
  });
  expect(badgeAfter.name).toBe("Zara");
  expect(resolveRowMacros("{{user}} waves", { characterId: null, personaId: zara }, macroCtx)).toBe("Zara waves");
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
  expect(initialsFor("Alice Smith")).toBe("AS");
  expect(initialsFor("Bob")).toBe("B");
  expect(initialsFor("   ")).toBe("?");
});

const HEARTH_TOKENS = { accent: "oklch(0.7 0.14 250)" };

test("Layer 3: an assistant row uses the character's authored themeOverride when present", () => {
  const participants = new Map([[ALICE_ID, makeParticipant({ displayName: "Alice", themeOverride: HEARTH_TOKENS })]]);
  const characterNamesById = new Map<CharacterId, RowCharacterName>([[ALICE_ID, { name: "Alice" }]]);
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
  expect(resolveRoomTheme(undefined)).toBeUndefined();
});

test("Layer 3 spans: speakerThemesByName maps a character's NAME to its override, else its ID-seeded hash", () => {
  const participants = new Map([
    [ALICE_ID, makeParticipant({ displayName: "Alice", themeOverride: HEARTH_TOKENS })],
    [BOB_ID, makeParticipant({ characterId: BOB_ID, displayName: "Bob" })], // no override → the hash tint
  ]);
  const byName = speakerThemesByName(participants);
  expect(byName.get("Alice")).toEqual(HEARTH_TOKENS);
  // EVERY seated character is in the map — an override-less member resolves to its deterministic tint, so
  // the map doubles as the room's cast-name set for the plain-`Name:` span parse.
  expect(byName.get("Bob")).toEqual(colorForCharacter(BOB_ID));
});

// ONE HASH INPUT. The fallback tint is seeded by the CHARACTER ID at every site, never by the display
// name — a name-seeded span hash forked one character into two colors (their own row vs their span inside
// a merged-narrator row), which reads as "the coloring is wrong". Both producers are checked together so
// the fork cannot reappear in one of them.
test("a character's narrator-span tint EQUALS their own row's tint (one hash input, both producers)", () => {
  const participants = new Map([[BOB_ID, makeParticipant({ characterId: BOB_ID, displayName: "Bob" })]]);
  const row = resolveRowAttribution({
    role: "assistant",
    characterId: BOB_ID,
    personaId: null,
    participants,
    characterNamesById: new Map<CharacterId, RowCharacterName>([[BOB_ID, { name: "Bob" }]]),
  });
  expect(speakerThemesByName(participants).get("Bob")).toEqual(row.tokens);
  // And NOT the name-seeded value the span path used to compute.
  expect(row.tokens).not.toEqual(colorForCharacter("Bob"));
});

// ── The card-embeddable partition at the two card-sourced READ seams (TD §3) ──────────────────────────
// A card supplies the room's LOOK, never the viewer's ergonomics. Both takeover planes project through
// `cardEmbeddableSubset`, so a viewer-sacred key on the blob — a legacy write, or a hand-posted one —
// paints nowhere. Pinned at BOTH seams: they are two call sites of one rule, and a re-spelling of either
// is exactly the drift the projection exists to prevent.

test("resolveRoomTheme carries the card's LOOK and strips the viewer-sacred half", () => {
  const human = makeParticipant({ kind: "human", characterId: null, displayName: "Nate" });
  const alice = makeParticipant({
    characterId: ALICE_ID,
    displayName: "Alice",
    themeOverride: { ...HEARTH_TOKENS, density: "compact" },
  });
  expect(resolveRoomTheme([human, alice])).toEqual(HEARTH_TOKENS);
});

test("speakerThemesByName strips the same half — and a card carrying ONLY a sacred key is omitted", () => {
  const participants = new Map([
    [ALICE_ID, makeParticipant({ displayName: "Alice", themeOverride: { ...HEARTH_TOKENS, density: "compact" } })],
    [BOB_ID, makeParticipant({ characterId: BOB_ID, displayName: "Bob", themeOverride: { density: "compact" } })],
  ]);
  const byName = speakerThemesByName(participants);
  expect(byName.get("Alice")).toEqual(HEARTH_TOKENS);
  // Nothing embeddable survived the projection → the span falls back to the same id-seeded hash tint.
  expect(byName.get("Bob")).toEqual(colorForCharacter(BOB_ID));
});

// ── The NARRATOR room (side-eye 2026-08-03 P1) ────────────────────────────────────────────────────────
// A narrator turn is persisted against the room's SYNTHETIC group character (`__group__<chatId>`, card
// name "Group") — a real `characters` row, so it rides the chat's name producer like any cast member and
// the `characterId === null` branch never fired. Every assistant row therefore resolved a NAME ("Group")
// and an id-hashed tint, and `NARRATOR_ATTRIBUTION` was unreachable in the one room it was written for.

const GROUP_PRODUCER_ID = castId<CharacterId>("char_group_room1");

test("a narrator room's assistant row is the NARRATOR, even though its stamped producer resolves a name", () => {
  const participants = new Map([
    [ALICE_ID, makeParticipant({ displayName: "Alice" })],
    [BOB_ID, makeParticipant({ characterId: BOB_ID, displayName: "Bob" })],
  ]);
  const characterNamesById = new Map<CharacterId, RowCharacterName>([
    [ALICE_ID, { name: "Alice" }],
    [BOB_ID, { name: "Bob" }],
    // The synthetic group card, exactly as the producer ships it.
    [GROUP_PRODUCER_ID, { name: "Group" }],
  ]);
  const result = resolveRowAttribution({
    role: "assistant",
    characterId: GROUP_PRODUCER_ID,
    personaId: null,
    participants,
    characterNamesById,
    narratorRoom: true,
  });
  expect(result.name).toBe("Narrator");
  // No tint: a narrator is not a cast member, so it never mints a per-speaker colour.
  expect(result.tokens).toBeNull();
});

test("the SAME row in a non-narrator room still resolves its stamped producer (the branch is mode-gated, not id-gated)", () => {
  const characterNamesById = new Map<CharacterId, RowCharacterName>([[GROUP_PRODUCER_ID, { name: "Group" }]]);
  const result = resolveRowAttribution({
    role: "assistant",
    characterId: GROUP_PRODUCER_ID,
    personaId: null,
    participants: new Map([[ALICE_ID, makeParticipant({ displayName: "Alice" })]]),
    characterNamesById,
  });
  expect(result.name).toBe("Group");
});

test("a narrator room's USER rows are untouched", () => {
  const result = resolveRowAttribution({
    role: "user",
    characterId: null,
    personaId: NATE_PERSONA_ID,
    personaNamesById: new Map<PersonaId, RowPersonaName>([[NATE_PERSONA_ID, { name: "Nate", description: "" }]]),
    narratorRoom: true,
  });
  expect(result.name).toBe("Nate");
});

// ── Dialogue-hue de-collision (side-eye 2026-08-03 P2) ────────────────────────────────────────────────
// Authored `themeOverride`s carry no cross-member guarantee: the demo room shipped two speakers 8° apart
// and their in-body dialogue spans read as ONE colour. Only the DIALOGUE token is arbitrated, and only
// against an earlier claimant.

test("two authored dialogue hues inside the separation threshold: the SECOND falls back to its id hash", () => {
  const participants = new Map([
    [ALICE_ID, makeParticipant({ displayName: "Alice", themeOverride: { dialogueColor: "oklch(0.85 0.10 80)", speaker: "oklch(0.74 0.10 248)" } })],
    [
      BOB_ID,
      makeParticipant({ characterId: BOB_ID, displayName: "Bob", themeOverride: { dialogueColor: "oklch(0.85 0.08 72)", speaker: "oklch(0.76 0.13 85)" } }),
    ],
  ]);
  const byName = speakerThemesByName(participants);
  expect(byName.get("Alice")?.dialogueColor).toBe("oklch(0.85 0.10 80)");
  expect(byName.get("Bob")?.dialogueColor).toBe(colorForCharacter(BOB_ID).dialogueColor);
  // Only the dialogue is arbitrated — the card's authored SPEAKER colour survives untouched.
  expect(byName.get("Bob")?.speaker).toBe("oklch(0.76 0.13 85)");
});

test("dialogue hues already far apart are both left exactly as authored", () => {
  const participants = new Map([
    [ALICE_ID, makeParticipant({ displayName: "Alice", themeOverride: { dialogueColor: "oklch(0.85 0.10 80)" } })],
    [BOB_ID, makeParticipant({ characterId: BOB_ID, displayName: "Bob", themeOverride: { dialogueColor: "oklch(0.85 0.10 200)" } })],
  ]);
  const byName = speakerThemesByName(participants);
  expect(byName.get("Alice")?.dialogueColor).toBe("oklch(0.85 0.10 80)");
  expect(byName.get("Bob")?.dialogueColor).toBe("oklch(0.85 0.10 200)");
});

test("a non-oklch authored dialogue colour is never de-collided (no hue to compare, so no fabricated one)", () => {
  const participants = new Map([
    [ALICE_ID, makeParticipant({ displayName: "Alice", themeOverride: { dialogueColor: "oklch(0.85 0.10 80)" } })],
    [BOB_ID, makeParticipant({ characterId: BOB_ID, displayName: "Bob", themeOverride: { dialogueColor: "#e0c27a" } })],
  ]);
  expect(speakerThemesByName(participants).get("Bob")?.dialogueColor).toBe("#e0c27a");
});
