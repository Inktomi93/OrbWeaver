// Unit: the persona editor form MODEL (features/persona/lib/persona-editor-model). Pure, no DOM — the
// node lane. Guards the load-bearing mappers the slice audit (F19) flagged as untested + the F6 fix:
//   • metadataFromForm (via the public personaInputFromForm) PRESERVES the provenance tail
//     (sourceCharacterId/swapMacros + loose extras) across a save — dropping them is silent data loss.
//   • the placement mapping: in_prompt/none drop `inject`, at_depth re-nests `{depth,role}`.
//   • the F6 WITHHOLD guard: the assistant@depth-0 prefill combo the wire rejects is withheld from the
//     write (base placement re-emitted verbatim) so sibling title/description still persist under autosave.

import { personaMetadataSchema } from "@orb/contracts/persona";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { PersonaFormValues } from "../../../../../packages/client/src/features/persona/lib/persona-editor-model.ts";
import { isPrefillCombo, personaInputFromForm } from "../../../../../packages/client/src/features/persona/lib/persona-editor-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const BASE_VALUES: PersonaFormValues = {
  title: "Narrator",
  description: "A calm observer.",
  descriptionPosition: "in_prompt",
  injectDepth: 2,
  injectRole: "system",
};

const form = (overrides: Partial<PersonaFormValues>): PersonaFormValues => ({
  ...BASE_VALUES,
  ...overrides,
});

// A persona minted from a character card carries provenance + arbitrary loose extras (the blob is
// `.loose()`). Built through the real schema (typed PersonaMetadata, no hand-cast) — `legacyNote` is a
// stale extra a future feature may have written that must survive an unrelated save untouched.
const SOURCE_CHARACTER_ID = mintTypeId(ID_PREFIX.character);
const PROVENANCE = personaMetadataSchema.parse({
  sourceCharacterId: SOURCE_CHARACTER_ID,
  swapMacros: true,
  descriptionPosition: "in_prompt",
  legacyNote: "keep me",
});

test("title: an empty/whitespace value maps to null (the nullable contract title); a real value passes", () => {
  expect(personaInputFromForm(form({ title: "" }), null).title).toBeNull();
  expect(personaInputFromForm(form({ title: "   " }), null).title).toBeNull();
  expect(personaInputFromForm(form({ title: "Narrator" }), null).title).toBe("Narrator");
});

test("placement mapping — in_prompt writes descriptionPosition and drops inject", () => {
  const { metadata } = personaInputFromForm(form({ descriptionPosition: "in_prompt" }), null);
  expect(metadata).toStrictEqual({ descriptionPosition: "in_prompt" });
  expect("inject" in (metadata as Record<string, unknown>)).toBe(false);
});

test("placement mapping — none drops inject too", () => {
  const { metadata } = personaInputFromForm(form({ descriptionPosition: "none" }), null);
  expect(metadata).toStrictEqual({ descriptionPosition: "none" });
});

test("placement mapping — at_depth re-nests inject {depth, role}", () => {
  const { metadata } = personaInputFromForm(form({ descriptionPosition: "at_depth", injectDepth: 4, injectRole: "user" }), null);
  expect(metadata).toStrictEqual({
    descriptionPosition: "at_depth",
    inject: { depth: 4, role: "user" },
  });
});

test("at_depth with an empty depth input falls back to the default depth (2), not null", () => {
  const { metadata } = personaInputFromForm(form({ descriptionPosition: "at_depth", injectDepth: null, injectRole: "user" }), null);
  expect(metadata).toStrictEqual({
    descriptionPosition: "at_depth",
    inject: { depth: 2, role: "user" },
  });
});

test("provenance tail (sourceCharacterId/swapMacros + loose extras) survives a save — only the editor's own keys are rewritten", () => {
  const { metadata } = personaInputFromForm(form({ descriptionPosition: "at_depth", injectDepth: 3, injectRole: "user" }), PROVENANCE);
  expect(metadata).toStrictEqual({
    sourceCharacterId: SOURCE_CHARACTER_ID,
    swapMacros: true,
    legacyNote: "keep me",
    // The stale in_prompt placement is replaced with the editor's new at_depth choice.
    descriptionPosition: "at_depth",
    inject: { depth: 3, role: "user" },
  });
});

test("isPrefillCombo flags ONLY assistant-role at depth 0 (the wire-rejected prefill)", () => {
  const combo = (o: Partial<PersonaFormValues>): boolean => isPrefillCombo(form({ descriptionPosition: "at_depth", injectRole: "assistant", ...o }));
  expect(combo({ injectDepth: 0 })).toBe(true);
  // empty depth reads as 0 → still the prefill
  expect(combo({ injectDepth: null })).toBe(true);
  // depth >= 1 is fine
  expect(combo({ injectDepth: 1 })).toBe(false);
  // a non-assistant role at depth 0 is fine
  expect(combo({ injectRole: "system", injectDepth: 0 })).toBe(false);
  // in_prompt never injects, so never a prefill
  expect(combo({ descriptionPosition: "in_prompt", injectDepth: 0 })).toBe(false);
});

test("F6 withhold — the prefill combo re-emits the base placement verbatim so it never reaches the wire, while title/description still save", () => {
  const prefill = form({
    title: "Fresh title",
    description: "Fresh description",
    descriptionPosition: "at_depth",
    injectRole: "assistant",
    injectDepth: 0,
  });
  const input = personaInputFromForm(prefill, PROVENANCE);
  // Siblings persist.
  expect(input.title).toBe("Fresh title");
  expect(input.description).toBe("Fresh description");
  // The metadata is the base blob untouched — the invalid at_depth/assistant/0 combo is withheld.
  expect(input.metadata).toStrictEqual({
    sourceCharacterId: SOURCE_CHARACTER_ID,
    swapMacros: true,
    descriptionPosition: "in_prompt",
    legacyNote: "keep me",
  });
});

test("F6 withhold — with no base metadata the prefill combo yields an empty blob (nothing invalid written)", () => {
  const input = personaInputFromForm(form({ descriptionPosition: "at_depth", injectRole: "assistant", injectDepth: 0 }), null);
  expect(input.metadata).toStrictEqual({});
});
