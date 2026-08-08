// The D137(E) card-face SINGLE-HOME proof. The strongest possible "one home" receipt is REFERENCE
// equality: composers SPREAD `cardFaceFields`' zod objects, so `createPersonaSchema.shape.name` and
// `characterCardSchema.shape.name` must be the SAME object (`Object.is`) — red the instant any composer
// re-spells a validator. Wrapped fields (`.nullable()`/`.optional()` — per-composer write semantics, not
// drift) are unwrapped to their inner schema before the identity check.
//
// The accept/reject table is the behavior-identity pin: the boundary values are the OLD per-domain
// literals (persona NAME 1/200 + DESCRIPTION 100_000; character NAME_MIN/NAME_MAX/TEXT_MAX — read off
// the pre-C1 sources), so a composed schema that shifts any limit reds here.

import type { ResolvedCardFace } from "@orb/contracts/card-face";
import { CARD_FACE_LIMITS, cardFaceFields } from "@orb/contracts/card-face";
import { characterCardSchema, createCharacterSchema, updateCharacterSchema } from "@orb/contracts/character";
import type { CastPersonaEntry } from "@orb/contracts/chat";
import { createPersonaSchema } from "@orb/contracts/persona";
import type { PersonaId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { CharacterDetail } from "../../../packages/server/src/domain/character/contract/views.ts";
import { expect, test } from "../../support/fixtures.ts";

// ── Reference equality — one home, proven per field per composer ─────────────────────────────────────

test("persona: createPersonaSchema's face fields ARE cardFaceFields (reference equality)", () => {
  expect(Object.is(createPersonaSchema.shape.name, cardFaceFields.name)).toBe(true);
  expect(Object.is(createPersonaSchema.shape.description, cardFaceFields.description)).toBe(true);
  // starred/avatarAssetId wrap `.optional()` per persona's write semantics — the INNER schema is the home.
  expect(Object.is(createPersonaSchema.shape.starred.unwrap(), cardFaceFields.starred)).toBe(true);
  expect(Object.is(createPersonaSchema.shape.avatarAssetId.unwrap(), cardFaceFields.avatarAssetId)).toBe(true);
});

test("character: characterCardSchema's face fields ARE cardFaceFields (reference equality)", () => {
  expect(Object.is(characterCardSchema.shape.name, cardFaceFields.name)).toBe(true);
  // description wraps `.nullable()` (card-spec fidelity — V2/V3 cards may omit it): inner is the home.
  expect(Object.is(characterCardSchema.shape.description.unwrap(), cardFaceFields.description)).toBe(true);
  expect(Object.is(characterCardSchema.shape.avatarAssetId, cardFaceFields.avatarAssetId)).toBe(true);
});

test("character: createCharacterSchema + updateCharacterSchema compose the same home", () => {
  expect(Object.is(createCharacterSchema.shape.name, cardFaceFields.name)).toBe(true);
  expect(Object.is(createCharacterSchema.shape.description, cardFaceFields.description)).toBe(true);
  expect(Object.is(createCharacterSchema.shape.avatarAssetId.unwrap(), cardFaceFields.avatarAssetId)).toBe(true);
  // `starred` lives on the UPDATE schema only (a row flag, not card content) — same home, optional-wrapped.
  expect(Object.is(updateCharacterSchema.shape.starred.unwrap(), cardFaceFields.starred)).toBe(true);
});

// ── Behavior identity — the OLD per-domain limits, unchanged by composition ──────────────────────────

test("the face limits are the measured pre-substrate literals (1/200/100_000)", () => {
  expect(CARD_FACE_LIMITS).toEqual({ nameMin: 1, nameMax: 200, textMax: 100_000 });
});

test("accept/reject: boundary name lengths behave identically across both composers", () => {
  const minName = "a";
  const maxName = "n".repeat(CARD_FACE_LIMITS.nameMax);
  const overName = "n".repeat(CARD_FACE_LIMITS.nameMax + 1);
  for (const name of [minName, maxName]) {
    expect(createPersonaSchema.safeParse({ name, description: "" }).success).toBe(true);
    expect(characterCardSchema.shape.name.safeParse(name).success).toBe(true);
  }
  expect(createPersonaSchema.safeParse({ name: "", description: "" }).success).toBe(false);
  expect(createPersonaSchema.safeParse({ name: overName, description: "" }).success).toBe(false);
  expect(characterCardSchema.shape.name.safeParse("").success).toBe(false);
  expect(characterCardSchema.shape.name.safeParse(overName).success).toBe(false);
});

test("accept/reject: the 100k description ceiling + per-composer nullability (write semantics, not drift)", () => {
  const maxDescription = "d".repeat(CARD_FACE_LIMITS.textMax);
  const overDescription = "d".repeat(CARD_FACE_LIMITS.textMax + 1);
  expect(createPersonaSchema.safeParse({ name: "p", description: maxDescription }).success).toBe(true);
  expect(createPersonaSchema.safeParse({ name: "p", description: overDescription }).success).toBe(false);
  // Persona description is REQUIRED ("" is a value to {{persona}}; absence isn't a state)…
  expect(createPersonaSchema.safeParse({ name: "p" }).success).toBe(false);
  // …while the character CARD's is nullable (V2/V3 fidelity) — same inner validator, different wrap.
  expect(characterCardSchema.shape.description.safeParse(null).success).toBe(true);
  expect(characterCardSchema.shape.description.safeParse(maxDescription).success).toBe(true);
  expect(characterCardSchema.shape.description.safeParse(overDescription).success).toBe(false);
});

test("accept/reject: avatarAssetId takes a branded asset id or null, rejects a foreign-prefix id", () => {
  expect(cardFaceFields.avatarAssetId.safeParse(null).success).toBe(true);
  expect(cardFaceFields.avatarAssetId.safeParse(mintTypeId(ID_PREFIX.asset)).success).toBe(true);
  expect(cardFaceFields.avatarAssetId.safeParse(mintTypeId(ID_PREFIX.chat)).success).toBe(false);
});

// ── Structural conformance (asserted, never forced by extends) ───────────────────────────────────────

test("CharacterDetail conforms to ResolvedCardFace<string | null> structurally (D137(E))", () => {
  // Compile-level: a zod-inferred card's mutable members cannot `extends` the readonly face identically
  // (TS2320), so ASSIGNABILITY is the belt — a face-field drift in either shape reds this function.
  const conforms = (detail: CharacterDetail): ResolvedCardFace<string | null> => detail;
  expect(typeof conforms).toBe("function");
});

test("CastPersonaEntry conforms to the resolved face minus starred (D137(E) — structural, by type)", () => {
  // Compile-level: a CastPersonaEntry satisfies the resolved-face field set it claims (name/description/
  // avatarHash); a drift in either shape reds this assignment.
  const entry: CastPersonaEntry = {
    kind: "persona",
    id: castId<PersonaId>(mintTypeId(ID_PREFIX.persona)),
    name: "n",
    description: "",
    avatarHash: null,
  };
  const projected: { name: string; description: string; avatarHash: string | null } = entry;
  expect(projected.name).toBe("n");
});
