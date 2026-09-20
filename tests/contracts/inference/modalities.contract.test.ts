// contracts/inference/modalities — the modality axis plus `parseModalities`, which is where a CATALOG's free
// strings become members. The unknown-value rule is the behaviour under test (D41): an unrecognised word is
// DROPPED and the result is marked `estimated`, never thrown and never silently absent. A catalog that grows
// a word tomorrow must degrade into "we are not sure what this model accepts", because the estimated flag is
// what the capability panel renders as a guess and what a later measurement is allowed to override.

import { MODALITIES, modalitySchema, parseModalities } from "@orb/contracts/inference";
import { expect, test } from "../../support/fixtures.ts";

test("every member parses to itself and anything else is REFUSED", () => {
  for (const modality of MODALITIES) {
    expect(modalitySchema.parse(modality)).toBe(modality);
  }
  for (const notAModality of ["images", "TEXT", "embeddings", ""]) {
    expect(modalitySchema.safeParse(notAModality).success).toBe(false);
  }
});

test("a fully-known list is exact and NOT estimated", () => {
  expect(parseModalities(["text", "image"])).toEqual({ modalities: ["text", "image"], estimated: false });
});

test("an unknown word is DROPPED and marks the result estimated — never a throw, never a silent pass", () => {
  const parsed = parseModalities(["text", "hologram", "image"]);
  expect(parsed.modalities).toEqual(["text", "image"]);
  expect(parsed.estimated, "the panel must be able to say this list is a guess").toBe(true);
});

test("an ABSENT list is estimated-empty — distinct from a catalog that reported an empty list", () => {
  expect(parseModalities(undefined)).toEqual({ modalities: [], estimated: true });
  expect(parseModalities([]), "an explicitly empty list is a measurement, not a guess").toEqual({ modalities: [], estimated: false });
});

test("order is the catalog's, and duplicates are preserved rather than deduped behind the caller's back", () => {
  expect(parseModalities(["image", "text", "image"]).modalities).toEqual(["image", "text", "image"]);
});
