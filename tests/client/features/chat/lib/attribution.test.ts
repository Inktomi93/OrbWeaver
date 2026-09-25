// Unit: per-row attribution resolution (features/chat/lib/attribution, #21 §12.4). Pins the trust
// rules: assistant rows resolve `characterId` against the per-chat macro-name PRODUCER (the SAME map
// the row's `{{char}}` macro reads); a null `characterId` in a multi-character room is "Narrator"
// (never `participants[0]`); user rows resolve `personaId` against the producer, falling back to the
// viewing participant's active persona for legacy rows; everything else renders no chrome.

import type { ParticipantView } from "@orb/contracts/chat";
import { carriedAppearanceFromParticipants, isNarratorVoiced, MESSAGE_KINDS } from "@orb/contracts/chat";
import type { ThemeOverride } from "@orb/contracts/theme";
import { CARD_EMBEDDABLE_THEME_KEYS, VIEWER_SACRED_THEME_KEYS } from "@orb/contracts/theme";
import type { CharacterId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { resolveRowMacros } from "@orb/kit/macro";
import { resolveRoomTheme, resolveRowAttribution, speakerThemesByName } from "../../../../../packages/client/src/features/chat/lib/attribution.ts";
import { colorForCharacter } from "../../../../../packages/client/src/features/chat/lib/speaker-color.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeParticipant } from "./_support.ts";

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
    displayName: "Alex",
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
  const personaNamesById = new Map<PersonaId, RowPersonaName>([[NATE_PERSONA_ID, { name: "Alex", description: "" }]]);
  const result = resolveRowAttribution({
    role: "user",
    characterId: null,
    personaId: NATE_PERSONA_ID,
    personaNamesById,
  });
  expect(result.name).toBe("Alex");
  expect(result.kind).toBe("persona"); // §A.8 KIND-READY
  expect(result.tokens).toBeNull();
  // `avatarAssetId` stays null for a user row (the field is character-only); the IMAGE comes from the
  // separate `personaAvatarsById` producer — absent here, so it degrades to initials.
  expect(result.avatarAssetId).toBeNull();
  expect(result.avatarHash).toBeNull();
});

test("user row resolves the avatar HASH from the separate personaAvatarsById producer (#67)", () => {
  const personaNamesById = new Map<PersonaId, RowPersonaName>([[NATE_PERSONA_ID, { name: "Alex", description: "" }]]);
  const personaAvatarsById = new Map<PersonaId, string | null>([[NATE_PERSONA_ID, "hash_nate"]]);
  const result = resolveRowAttribution({
    role: "user",
    characterId: null,
    personaId: NATE_PERSONA_ID,
    personaNamesById,
    personaAvatarsById,
  });
  expect(result.name).toBe("Alex");
  expect(result.avatarHash).toBe("hash_nate");
});

test("user row with a null personaId falls back to the viewer's active persona — ONLY on the viewer's OWN row (legacy rows)", () => {
  const personaNamesById = new Map<PersonaId, RowPersonaName>([[NATE_PERSONA_ID, { name: "Alex", description: "" }]]);
  const viewer = castId<UserId>("user_viewer");
  const result = resolveRowAttribution({
    role: "user",
    characterId: null,
    personaId: null,
    personaNamesById,
    activePersonaId: NATE_PERSONA_ID,
    authorUserId: viewer,
    viewerUserId: viewer,
  });
  expect(result.name).toBe("Alex");
});

// THE MISATTRIBUTION REGRESSION (live 2026-08-03). `activePersonaId` is the VIEWER's persona. A member
// joined with an unbound seat, so his rows persisted `personaId: null` — and the legacy fallback named
// every one of them with the VIEWER's persona. Another human's words appeared under the host's name, in
// the transcript AND in the prompt built from those rows.
test("a DIFFERENT author's null-persona row never borrows the viewer's persona", () => {
  const personaNamesById = new Map<PersonaId, RowPersonaName>([[NATE_PERSONA_ID, { name: "Alex", description: "" }]]);
  const result = resolveRowAttribution({
    role: "user",
    characterId: null,
    personaId: null,
    personaNamesById,
    activePersonaId: NATE_PERSONA_ID,
    authorUserId: castId<UserId>("user_someone_else"),
    viewerUserId: castId<UserId>("user_viewer"),
  });
  expect(result.name).not.toBe("Alex");
});

test("fail-closed: an UNKNOWN author (or unknown viewer) gets no fallback", () => {
  const personaNamesById = new Map<PersonaId, RowPersonaName>([[NATE_PERSONA_ID, { name: "Alex", description: "" }]]);
  const result = resolveRowAttribution({ role: "user", characterId: null, personaId: null, personaNamesById, activePersonaId: NATE_PERSONA_ID });
  expect(result.name).not.toBe("Alex");
});

test("user row with NO resolvable persona labels 'Traveler' — never 'You' (the collision that rename killed)", () => {
  const result = resolveRowAttribution({
    role: "user",
    characterId: null,
    personaId: null,
    personaNamesById: new Map<PersonaId, RowPersonaName>(), // nothing resolves — no persona exists
  });
  // Users are FORCED to hold a persona (boot seeds `Traveler`), so this is the unresolvable floor.
  // "You" here re-creates the exact collision the Traveler rename was minted to kill — and the model is
  // shown this identity and writes it into the prose.
  expect(result.name).toBe("Traveler");
  expect(result.kind).toBe("persona"); // §A.8 KIND-READY — the fallback is still the persona side
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
    [NATE_PERSONA_ID, { name: "Alex", description: "" }],
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

const COMPLETE_CARD_THEME = {
  accent: "oklch(0.70 0.14 250)",
  userBubble: { bg: "oklch(0.25 0.04 250)", fg: "oklch(0.95 0.01 250)" },
  aiBubble: { bg: "oklch(0.30 0.04 250)", fg: "oklch(0.94 0.01 250)" },
  systemBubble: { bg: "oklch(0.35 0.03 250)", fg: "oklch(0.93 0.01 250)" },
  speaker: "oklch(0.74 0.16 250)",
  dialogueColor: "oklch(0.78 0.12 250)",
  narrationColor: "oklch(0.82 0.05 250)",
  bodyColor: "oklch(0.90 0.02 250)",
  font: "Georgia",
  radius: "full",
  background: "oklch(0.18 0.03 250)",
  borderColor: "oklch(0.48 0.07 250)",
  density: "compact",
} satisfies Required<ThemeOverride>;

function expectCardProjection(tokens: ThemeOverride | null | undefined): void {
  expect(tokens).not.toBeNull();
  expect(tokens).not.toBeUndefined();
  for (const key of CARD_EMBEDDABLE_THEME_KEYS) {
    expect(tokens).toHaveProperty(key, COMPLETE_CARD_THEME[key]);
  }
  for (const key of VIEWER_SACRED_THEME_KEYS) {
    expect(tokens).not.toHaveProperty(key);
  }
}

test("Layer 3: an assistant row uses the card-embeddable part of the character's authored themeOverride", () => {
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
  const human = makeParticipant({ kind: "human", characterId: null, displayName: "Alex" });
  const alice = makeParticipant({
    characterId: ALICE_ID,
    displayName: "Alice",
    themeOverride: HEARTH_TOKENS,
  });
  const bob = makeParticipant({ characterId: BOB_ID, displayName: "Bob" });
  // Exactly one human + one character → takeover.
  expect(resolveRoomTheme(carriedAppearanceFromParticipants([human, alice]))).toEqual(HEARTH_TOKENS);
  // A second character (group) → no takeover.
  expect(resolveRoomTheme(carriedAppearanceFromParticipants([human, alice, bob]))).toBeUndefined();
  // A second human → no takeover (each human keeps their own theme).
  const human2 = makeParticipant({ kind: "human", characterId: null, displayName: "Sam" });
  expect(resolveRoomTheme(carriedAppearanceFromParticipants([human, human2, alice]))).toBeUndefined();
  // No cast at all (landing, or a read that has not settled) → the viewer's own theme.
  expect(resolveRoomTheme(undefined)).toBeUndefined();
});

// DRAFT PARITY (owner dogfood 2026-08-06): the takeover reads a `CarriedAppearance`, not a roster, so
// a chat that has no server row yet wears its founding card's theme immediately. Before this, the room
// theme was gated on the committed roster and the whole room re-skinned itself at the first send.
test("Layer 2: a pre-send DRAFT's founding card takes over the room theme with no roster at all", () => {
  const soloDraft = { humanCount: 1, characters: [{ displayName: "Alice", themeOverride: HEARTH_TOKENS, backgroundOverride: null }] };
  expect(resolveRoomTheme(soloDraft)).toEqual(HEARTH_TOKENS);
  // A GROUP draft keeps the viewer's theme — the same no-arbitrary-pick refusal a committed group makes.
  const groupDraft = {
    humanCount: 1,
    characters: [
      { displayName: "Alice", themeOverride: HEARTH_TOKENS, backgroundOverride: null },
      { displayName: "Bob", themeOverride: null, backgroundOverride: null },
    ],
  };
  expect(resolveRoomTheme(groupDraft)).toBeUndefined();
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

// ── The card-embeddable partition at every CHAT ATTRIBUTION producer (TD §3) ──────────────────────────────────
// A card supplies the room's LOOK, never the viewer's ergonomics. These three chat projection producers
// run through `cardEmbeddableSubset`, so a viewer-sacred key on the blob — a legacy write, or a hand-posted
// one — cannot paint room, ordinary-row, narrator-span, or streaming-ghost attribution. Character-detail
// surfaces have their own rendered boundary tests; this suite no longer overclaims every card render seam.
// The tuple-driven assertions enumerate the complete partition: adding a key without preserving its
// classified reach at each chat producer fails here.

test("resolveRoomTheme carries every card-embeddable field and strips every viewer-sacred field", () => {
  const human = makeParticipant({ kind: "human", characterId: null, displayName: "Alex" });
  const alice = makeParticipant({
    characterId: ALICE_ID,
    displayName: "Alice",
    themeOverride: COMPLETE_CARD_THEME,
  });
  const projected = resolveRoomTheme(carriedAppearanceFromParticipants([human, alice]));
  expect(projected).toBeDefined();
  expectCardProjection(projected);
});

test("ordinary row attribution carries every card-embeddable field and strips every viewer-sacred field", () => {
  const participants = new Map([[ALICE_ID, makeParticipant({ displayName: "Alice", themeOverride: COMPLETE_CARD_THEME })]]);
  const result = resolveRowAttribution({
    role: "assistant",
    characterId: ALICE_ID,
    personaId: null,
    participants,
    characterNamesById: new Map<CharacterId, RowCharacterName>([[ALICE_ID, { name: "Alice" }]]),
  });
  expect(result.tokens).not.toBeNull();
  expectCardProjection(result.tokens);
});

test("speakerThemesByName carries the same subset — and a card carrying ONLY sacred fields falls back", () => {
  const participants = new Map([
    [ALICE_ID, makeParticipant({ displayName: "Alice", themeOverride: COMPLETE_CARD_THEME })],
    [BOB_ID, makeParticipant({ characterId: BOB_ID, displayName: "Bob", themeOverride: { density: "compact" } })],
  ]);
  const byName = speakerThemesByName(participants);
  expectCardProjection(byName.get("Alice"));
  // Nothing embeddable survived the projection → the span falls back to the same id-seeded hash tint.
  expect(byName.get("Bob")).toEqual(colorForCharacter(BOB_ID));
});

// ── The NARRATOR room (side-eye 2026-08-03 P1) ────────────────────────────────────────────────────────
// A narrator turn is persisted against the room's SYNTHETIC group character (`__group__<chatId>`, card
// name "Group") — a real `characters` row, so it rides the chat's name producer like any cast member and
// the `characterId === null` branch never fired. Every assistant row therefore resolved a NAME ("Group")
// and an id-hashed tint, and `NARRATOR_ATTRIBUTION` was unreachable in the one room it was written for.

const GROUP_PRODUCER_ID = castId<CharacterId>("char_group_room1");

test("a NARRATOR-KIND assistant row is the NARRATOR, even though its stamped producer resolves a name", () => {
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
    kind: "narrator",
  });
  expect(result.name).toBe("Narrator");
  // No tint: a narrator is not a cast member, so it never mints a per-speaker colour.
  expect(result.tokens).toBeNull();
});

// D129: the axis is the ROW's declared purpose, not the room's dial — so the SAME stamped producer id, in the
// SAME room, resolves differently per row. That is the whole point: flipping `group.output` cannot re-classify
// history any more, and a `standard` row stamped with the synthetic card is still that card.
test("the SAME row declared STANDARD still resolves its stamped producer (the branch is kind-gated, not id-gated)", () => {
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

test("a USER row is untouched by the kind arm (purpose gates the assistant plane only)", () => {
  const result = resolveRowAttribution({
    role: "user",
    characterId: null,
    personaId: NATE_PERSONA_ID,
    personaNamesById: new Map<PersonaId, RowPersonaName>([[NATE_PERSONA_ID, { name: "Alex", description: "" }]]),
    kind: "narrator",
  });
  expect(result.name).toBe("Alex");
});

test("isNarratorVoiced is TOTAL over the kind axis — only `narrator` opens the span grammar", () => {
  // The chrome dispatch's own pin: a fourth kind is a tsc error at the switch, and this asserts the three
  // ruled answers plus the no-slot (draft-greeting) row, which must read as the ordinary arm.
  expect(MESSAGE_KINDS.filter((k) => isNarratorVoiced(k))).toEqual(["narrator"]);
  expect(isNarratorVoiced(undefined)).toBe(false);
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
