import { createPersonaSchema, personaMetadataSchema, personaMetadataWriteSchema, updatePersonaSchema } from "@orb/contracts/persona";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

// Valid sample ids minted at runtime (no pasted high-entropy literals — noSecrets).
const assetId = mintTypeId(ID_PREFIX.asset);
const characterId = mintTypeId(ID_PREFIX.character);

test("createPersonaSchema parses a minimal valid payload and round-trips", () => {
  const value = { name: "Aria", description: "A calm traveler." };
  const parsed = createPersonaSchema.parse(value);
  expect(parsed).toEqual(value);
});

test("createPersonaSchema parses a full payload (avatar + metadata) and round-trips", () => {
  const value = {
    name: "Aria",
    description: "A calm traveler.",
    avatarAssetId: assetId,
    metadata: { descriptionPosition: "in_prompt" },
  };
  const parsed = createPersonaSchema.parse(value);
  expect(parsed).toEqual(value);
});

test("createPersonaSchema rejects an empty name (min length)", () => {
  expect(createPersonaSchema.safeParse({ name: "", description: "x" }).success).toBe(false);
});

test("createPersonaSchema rejects a malformed avatarAssetId (wrong prefix)", () => {
  // A character id where an asset id is required — the branded prefix check rejects it.
  expect(
    createPersonaSchema.safeParse({
      name: "Aria",
      description: "A calm traveler.",
      avatarAssetId: characterId,
    }).success,
  ).toBe(false);
});

test("updatePersonaSchema is fully partial (accepts an empty object and a single field)", () => {
  expect(updatePersonaSchema.parse({})).toEqual({});
  expect(updatePersonaSchema.parse({ name: "Aria" })).toEqual({ name: "Aria" });
});

test("personaMetadataSchema is typed: a bogus descriptionPosition is rejected (not Record<string,unknown>)", () => {
  expect(personaMetadataSchema.safeParse({ descriptionPosition: "bogus" }).success).toBe(false);
});

test("personaMetadataSchema parses typed fields + provenance and preserves the loose tail (round-trip)", () => {
  const value = {
    descriptionPosition: "at_depth",
    inject: { depth: 2, role: "system" },
    sourceCharacterId: characterId,
    swapMacros: true,
    futureFlag: true,
  };
  const parsed = personaMetadataSchema.parse(value);
  expect(parsed).toEqual(value);
});

test("personaMetadataWriteSchema accepts a valid at-depth inject and round-trips the open record", () => {
  const value = { descriptionPosition: "at_depth", inject: { depth: 1, role: "user" } };
  const parsed = personaMetadataWriteSchema.parse(value);
  expect(parsed).toEqual(value);
});

test("personaMetadataWriteSchema stays an open record (arbitrary keys survive)", () => {
  const value = { futureFlag: true, note: "extra" };
  expect(personaMetadataWriteSchema.parse(value)).toEqual(value);
});

test("personaMetadataWriteSchema rejects a typo'd descriptionPosition at write", () => {
  expect(personaMetadataWriteSchema.safeParse({ descriptionPosition: "bogus" }).success).toBe(false);
});

// D66-B (W5, ruling A): the assistant@depth-0 WRITE-reject is REMOVED — authored prefill is now
// persistable; safety moved from the write guard to the SHAPE delivery gate (a `assistantPrefill:false`
// model normalizes the trailing assistant at delivery, else it 400s). The write schema keeps only shape
// validation.
test("personaMetadataWriteSchema ACCEPTS an assistant@depth-0 prefill (normalized at SHAPE delivery, D66-B)", () => {
  expect(
    personaMetadataWriteSchema.safeParse({
      descriptionPosition: "at_depth",
      inject: { depth: 0, role: "assistant" },
    }).success,
  ).toBe(true);
  // assistant at depth >= 1 stays valid too.
  expect(
    personaMetadataWriteSchema.safeParse({
      inject: { depth: 1, role: "assistant" },
    }).success,
  ).toBe(true);
});
