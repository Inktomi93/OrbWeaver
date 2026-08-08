// The D137 kind-polymorphic CAST producer contract (Chat-Macro-Resolution.md §1): the closed
// `CAST_KINDS` axis, its total `CAST_KIND_POLICY` record (the D34-style tuple↔record mirror), the
// `castKey` namespace (extends `speakerKey`'s — the two key spaces can never collide), and the two
// projections that keep the macro path names-only BY TYPE (`buildCastNameContext`'s outputs are the
// kit's avatar-free entry types; `buildCastAvatarMaps` is the ONLY chrome carrier).

import type { CastCharacterEntry, CastEntry, CastPersonaEntry } from "@orb/contracts/chat";
import { buildCastAvatarMaps, buildCastNameContext, CAST_KIND_POLICY, CAST_KINDS, castKey, speakerKey } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

const ARIA_ID = castId<CharacterId>(mintTypeId(ID_PREFIX.character));
const KAI_ID = castId<CharacterId>(mintTypeId(ID_PREFIX.character));
const MARA_ID = castId<PersonaId>(mintTypeId(ID_PREFIX.persona));

function aria(overrides: Partial<Omit<CastCharacterEntry, "kind">> = {}): CastCharacterEntry {
  return { kind: "character", id: ARIA_ID, name: "Aria", avatarHash: "hash_aria", ...overrides };
}

function mara(overrides: Partial<Omit<CastPersonaEntry, "kind">> = {}): CastPersonaEntry {
  return { kind: "persona", id: MARA_ID, name: "Mara", description: "a wandering scholar", avatarHash: null, ...overrides };
}

// ── The axis ↔ policy totality mirror (the D34 tuple↔record shape) ────────────────────────────────────

test("CAST_KIND_POLICY covers exactly CAST_KINDS — no missing row, no phantom kind", () => {
  expect(Object.keys(CAST_KIND_POLICY).toSorted()).toEqual([...CAST_KINDS].toSorted());
});

test("the shipped policy rows: character is char-subject/participant-first, persona is user-subject/cast-only", () => {
  // Each field names its live reader (§3.2): `macro` routes the name-context projection below;
  // `avatar` is read by resolveRowAttribution's per-kind avatar precedence.
  expect(CAST_KIND_POLICY.character).toEqual({ macro: "char-subject", avatar: "participant-first" });
  expect(CAST_KIND_POLICY.persona).toEqual({ macro: "user-subject", avatar: "cast-only" });
});

// ── castKey — the speakerKey-namespace-extending stable merge key ─────────────────────────────────────

test("castKey mints kind-prefixed keys that are unique across kinds sharing one id string", () => {
  expect(castKey(aria())).toBe(`c:${ARIA_ID}`);
  expect(castKey(mara())).toBe(`p:${MARA_ID}`);
  // Two kinds can never collide even over an identical raw id string.
  const sharedRaw = mintTypeId(ID_PREFIX.character);
  const asCharacter: CastEntry = { kind: "character", id: castId<CharacterId>(sharedRaw), name: "X", avatarHash: null };
  const asPersona: CastEntry = { kind: "persona", id: castId<PersonaId>(sharedRaw), name: "X", description: "", avatarHash: null };
  expect(castKey(asCharacter)).not.toBe(castKey(asPersona));
});

test("castKey's character arm IS speakerKey's namespace (§3.8 — deliberately shared, never colliding)", () => {
  expect(castKey(aria())).toBe(speakerKey({ kind: "character", characterId: ARIA_ID }));
});

// ── buildCastNameContext — the names-only macro projection ────────────────────────────────────────────

test("buildCastNameContext routes each kind to its policy's macro-subject map", () => {
  const { characterNamesById, personaNamesById } = buildCastNameContext([aria(), { kind: "character", id: KAI_ID, name: "Kai", avatarHash: null }, mara()]);
  // char-subject family ({{char}}) ← character entries.
  expect(characterNamesById.get(ARIA_ID)).toEqual({ name: "Aria" });
  expect(characterNamesById.get(KAI_ID)).toEqual({ name: "Kai" });
  expect(characterNamesById.size).toBe(2);
  // user-subject family ({{user}}/{{persona}}) ← persona entries.
  expect(personaNamesById.get(MARA_ID)).toEqual({ name: "Mara", description: "a wandering scholar" });
  expect(personaNamesById.size).toBe(1);
});

test("the names-only law survives BY TYPE: neither name map's values carry avatar chrome", () => {
  const { characterNamesById, personaNamesById } = buildCastNameContext([aria(), mara()]);
  // The projection outputs are the KIT types (RowCharacterName/RowPersonaName) — no avatarHash field,
  // so the macro engine remains structurally unable to see chrome (§3.3).
  const character = characterNamesById.get(ARIA_ID);
  const persona = personaNamesById.get(MARA_ID);
  expect(character !== undefined && "avatarHash" in character).toBe(false);
  expect(persona !== undefined && "avatarHash" in persona).toBe(false);
});

test("buildCastNameContext is last-write-wins on a duplicate id (the detail ∪ pages merge contract)", () => {
  const { characterNamesById } = buildCastNameContext([aria({ name: "Aria (stale)" }), aria({ name: "Aria" })]);
  expect(characterNamesById.get(ARIA_ID)).toEqual({ name: "Aria" });
  expect(characterNamesById.size).toBe(1);
});

test("buildCastNameContext of an empty cast is two empty maps", () => {
  const { characterNamesById, personaNamesById } = buildCastNameContext([]);
  expect(characterNamesById.size).toBe(0);
  expect(personaNamesById.size).toBe(0);
});

// ── buildCastAvatarMaps — the chrome projection ───────────────────────────────────────────────────────

test("buildCastAvatarMaps routes each kind's avatarHash to its own map, preserving null (initials fallback)", () => {
  const { characterAvatarsById, personaAvatarsById } = buildCastAvatarMaps([
    aria(),
    { kind: "character", id: KAI_ID, name: "Kai", avatarHash: null },
    mara({ avatarHash: "hash_mara" }),
  ]);
  expect(characterAvatarsById.get(ARIA_ID)).toBe("hash_aria");
  // A null hash stays an ENTRY (never dropped) — the renderer's initials fallback keys off the null.
  expect(characterAvatarsById.has(KAI_ID)).toBe(true);
  expect(characterAvatarsById.get(KAI_ID)).toBeNull();
  expect(personaAvatarsById.get(MARA_ID)).toBe("hash_mara");
  expect(personaAvatarsById.size).toBe(1);
});

test("buildCastAvatarMaps is last-write-wins on a duplicate id and empty-in/empty-out", () => {
  const { personaAvatarsById } = buildCastAvatarMaps([mara({ avatarHash: "hash_old" }), mara({ avatarHash: "hash_new" })]);
  expect(personaAvatarsById.get(MARA_ID)).toBe("hash_new");
  const empty = buildCastAvatarMaps([]);
  expect(empty.characterAvatarsById.size).toBe(0);
  expect(empty.personaAvatarsById.size).toBe(0);
});
