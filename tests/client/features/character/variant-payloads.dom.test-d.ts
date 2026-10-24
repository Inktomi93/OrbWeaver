import { expectTypeOf, test } from "vitest";
import type { CharacterFacetRowProps } from "#client/features/character/components/character-facet-row.tsx";

test("a facet row cannot disagree with the presence of its preview", () => {
  type Common = Pick<CharacterFacetRowProps, "facet" | "selected" | "fillSummary" | "focusOnMount" | "onSelect">;
  expectTypeOf<Common & { filled: true; preview: null }>().not.toExtend<CharacterFacetRowProps>();
  expectTypeOf<Common & { filled: false; preview: string }>().not.toExtend<CharacterFacetRowProps>();
  expectTypeOf<Common & { filled: true; preview: string }>().toExtend<CharacterFacetRowProps>();
  expectTypeOf<Common & { filled: false; preview: null }>().toExtend<CharacterFacetRowProps>();
});
