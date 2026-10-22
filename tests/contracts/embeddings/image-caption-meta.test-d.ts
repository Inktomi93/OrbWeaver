// Application metadata readers expose only canonical facets, even when stored blobs preserve future fields.
import type { ImageBreakdown, ImageCaptionMeta } from "@orb/contracts/embeddings";
import type { imageAnalyses } from "@orb/db";
import { expectTypeOf, test } from "vitest";

type StoredCaptionMeta = (typeof imageAnalyses.$inferSelect)["captionMeta"];

test("the persisted reader carries the canonical optional facet values", () => {
  const legacy: ImageCaptionMeta = { model: "vision-model" };
  const current: StoredCaptionMeta = { artStyle: "anime", tags: ["portrait"] };
  expectTypeOf<StoredCaptionMeta>().toEqualTypeOf<ImageCaptionMeta>();
  expectTypeOf(legacy.model).toEqualTypeOf<string | undefined>();
  expectTypeOf(current.artStyle).toEqualTypeOf<ImageBreakdown["artStyle"] | undefined>();
  expectTypeOf(current.tags).toEqualTypeOf<string[] | undefined>();
});

test("canonical and persisted readers reject misspelled reads and invented fields", () => {
  // @ts-expect-error a misspelled facet is not an application reader key
  const typo: ImageCaptionMeta["artStlye"] = undefined;
  // @ts-expect-error the actual database reader must not admit arbitrary bracket keys
  const storedTypo: StoredCaptionMeta["artStlye"] = undefined;
  // @ts-expect-error unknown retained residue is not a declared application field
  const extra: ImageCaptionMeta = { model: "vision-model", vendorFacet: true };
  // @ts-expect-error a misspelled stored facet with an unrelated value must be refused
  const storedExtra: StoredCaptionMeta = { artStlye: 123 };
  // @ts-expect-error known facet values still follow the canonical vocabulary
  const wrongValue: ImageCaptionMeta = { artStyle: "unsupported-style" };
  expectTypeOf(typo).toEqualTypeOf<typeof storedTypo>();
  expectTypeOf([extra, storedExtra, wrongValue]).toEqualTypeOf<ImageCaptionMeta[]>();
});
