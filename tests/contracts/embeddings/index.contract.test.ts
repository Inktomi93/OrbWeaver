import type { ImageLens } from "@orb/contracts/embeddings";
import { IMAGE_LENSES, imageLensSchema, VECTOR_SCOPES, VECTOR_SCOPES_BY_TASK } from "@orb/contracts/embeddings";
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

// ── The VECTOR-SCOPE axis (§10-5) — the granularity at which "the reindex finished" is a true statement ──
// Same D34 reason as the lens tuple: `@orb/db` derives `embed_space_state.scope`'s enum + CHECK from it.

test("every vector scope is claimed by exactly one task — no scope is unowned or double-counted", () => {
  const claimed = [...VECTOR_SCOPES_BY_TASK.embed, ...VECTOR_SCOPES_BY_TASK.imageEmbed];
  // Unowned: a scope no task folds is a sweep whose completion nothing reads — the state row would be
  // written forever and never consulted. Double-counted: a scope in both tasks makes one lagging sweep
  // block a task it has nothing to do with.
  expect(claimed.toSorted()).toEqual(VECTOR_SCOPES.toSorted());
  expect(new Set(claimed).size).toBe(claimed.length);
});
