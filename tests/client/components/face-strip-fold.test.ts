// Unit: the FaceStrip fold math (FACEFILT). The rendered proof lives in `face-strip.ct.tsx` (a width
// sweep); this pins the RULES at the arms a browser sweep can only hit by luck — the leftover-of-one
// squeeze, the honest count, and the single-face pane that has no slot left to save it with.

import { foldFaces } from "../../../packages/client/src/components/face-strip-fold";
import { expect, test } from "../../support/fixtures";

/** A pane's worth of measurements: uniform faces unless a case needs otherwise. */
function input(widths: readonly number[], available: number, triggerWidth = 40, gap = 6): Parameters<typeof foldFaces>[0] {
  return { available, gap, triggerWidth, widths };
}

test("a cast that fits keeps every face and asks for NO tile", () => {
  expect(foldFaces(input([50, 50, 50], 200))).toEqual({ hidden: 0, squeezed: false, visible: 3 });
  // Exactly flush — the last face's right edge lands on the pane's edge, which fits.
  expect(foldFaces(input([50, 50, 50], 162))).toEqual({ hidden: 0, squeezed: false, visible: 3 });
});

test("an overflowing cast folds, and the tile's count is exactly what is not rendered", () => {
  // 100px pane: 50 + 6 + 40 = 96 buys one face and the tile; a second face would need 152.
  const fold = foldFaces(input([50, 50, 50, 50], 100));
  expect(fold).toEqual({ hidden: 3, squeezed: false, visible: 1 });
  expect(fold.visible + fold.hidden).toBe(4);
});

test("the LEFTOVER OF ONE takes the tile's slot instead of hiding behind it — a '+1 more' button IS the face it hides", () => {
  // 152px holds two faces + the tile (50+6+50+6+40); three bare faces need 162 and do not fit. The third
  // is therefore the leftover — and it squeezes into the tile's slot rather than becoming a tile whose
  // entire contents is that one face.
  expect(foldFaces(input([50, 50, 50], 152))).toEqual({ hidden: 0, squeezed: true, visible: 3 });
});

test("the squeeze only reaches ONE face — two leftovers stay behind an honest tile", () => {
  // 4 faces, room for 2 + the tile (50+6+50+6+40 = 152): two are genuinely hidden.
  expect(foldFaces(input([50, 50, 50, 50], 152))).toEqual({ hidden: 2, squeezed: false, visible: 2 });
});

test("a single face too wide for its own pane keeps the tile as the only door left", () => {
  // Nothing to squeeze into — there is no fitting run to sit beside.
  expect(foldFaces(input([300], 100))).toEqual({ hidden: 1, squeezed: false, visible: 0 });
});

test("VARIABLE widths are respected — a long name costs its own slot, not an average one", () => {
  // The 120px name is what folds the strip: with the tile reserved only ONE face fits (6+40+34=80; a
  // second would need 206), even though two fit unaided. A uniform-slot fold would have claimed four.
  expect(foldFaces(input([34, 120, 34, 34], 160, 40))).toEqual({ hidden: 3, squeezed: false, visible: 1 });
  // The same four faces in a friendlier order fit entirely.
  expect(foldFaces(input([34, 34, 34, 34], 160, 40))).toEqual({ hidden: 0, squeezed: false, visible: 4 });
});

test("an empty strip folds to nothing (the component renders no shell at all)", () => {
  expect(foldFaces(input([], 200))).toEqual({ hidden: 0, squeezed: false, visible: 0 });
});
