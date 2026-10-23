import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { CHARACTER_CARD_FACET_IDS, facetFillState } from "#client/features/character/lib/character-card-facets.ts";
import { DEFAULT_CHARACTER_CARD_FORM } from "#client/features/character/lib/character-card-form-model.ts";

test("facet fill and preview agree for empty drafts, trimmed text, metadata and attached scripts", () => {
  for (const id of CHARACTER_CARD_FACET_IDS) {
    expect(facetFillState(id, DEFAULT_CHARACTER_CARD_FORM, 0)).toEqual({ filled: false, preview: null });
  }
  const values = {
    ...DEFAULT_CHARACTER_CARD_FORM,
    description: "  A patient guide.  ",
    depthPromptText: "  Stay curious. ",
    creator: " Nate ",
    cardVersion: " 2 ",
  };
  expect(facetFillState("description", values, 0)).toEqual({ filled: true, preview: "A patient guide." });
  expect(facetFillState("depthPrompt", values, 0)).toEqual({ filled: true, preview: "Stay curious." });
  expect(facetFillState("provenance", values, 0)).toEqual({ filled: true, preview: "Nate · 2" });
  expect(facetFillState("provenance", { ...values, creator: " " }, 0)).toEqual({ filled: true, preview: "2" });
  expect(facetFillState("description", { ...values, description: " \n " }, 0)).toEqual({ filled: false, preview: null });
  expect(facetFillState("regexScripts", values, 1)).toEqual({ filled: true, preview: "1 script" });
  expect(facetFillState("regexScripts", values, 2)).toEqual({ filled: true, preview: "2 scripts" });
});
