import type { ImageLens } from "@orb/contracts/embeddings";
import { IMAGE_LENSES, imageLensSchema } from "@orb/contracts/embeddings";
import { expect, test } from "../../support/fixtures.ts";

// ── The IMAGE-lens axis (D34 — promoted to contracts so the db `image_embeddings.lens` column derives it) ──
// The ONE home for the image-lens union (§7.5). A drift here would mean the db enum / CHECK / test-mirror
// have re-spelled it — the whole point of this node. Members are the image SUBSET of the domain SourceLens
// (the text lenses card-text/segment/digest are NOT a column and are deliberately NOT spelled here).
test("IMAGE_LENSES is exactly the 2-member image axis [image-raw, image-captioned]", () => {
  expect(IMAGE_LENSES).toEqual(["image-raw", "image-captioned"]);
  expect(imageLensSchema.options).toEqual(IMAGE_LENSES);
});

test("imageLensSchema round-trips every valid lens and rejects non-members", () => {
  for (const lens of IMAGE_LENSES) {
    expect(imageLensSchema.parse(lens)).toBe(lens);
  }
  // The text lenses are NOT image lenses (they route to other tables, not this column) — rejected here.
  expect(imageLensSchema.safeParse("card-text").success).toBe(false);
  expect(imageLensSchema.safeParse("segment").success).toBe(false);
  expect(imageLensSchema.safeParse("digest").success).toBe(false);
  expect(imageLensSchema.safeParse("nope").success).toBe(false);
  expect(imageLensSchema.safeParse("").success).toBe(false);
});

// Exhaustiveness: a `Record<ImageLens, …>` is tsc-red if a member is added/removed, backing the runtime
// assert above with a compile-time guard (no inline re-spelling anywhere).
const LENS_SEEN: Record<ImageLens, true> = {
  "image-raw": true,
  "image-captioned": true,
};
test("ImageLens has no member beyond the tuple (exhaustive over image-raw|image-captioned)", () => {
  expect(Object.keys(LENS_SEEN).sort()).toEqual(IMAGE_LENSES.toSorted());
});
