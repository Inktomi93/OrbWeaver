// CT: the MediaTileGrid composite — the house MEDIA-FORWARD BROWSE GRID (the shelf rung that was missing when
// a library of character cards rendered as `ListRow`s failure 1).
//
// WHAT IS PINNED, and why each one is the thing that actually goes wrong in this genre:
//  1. THE COVER'S BOX IS RESERVED BY THE TILE, not by the image. `aspect-ratio` on a pre-load `<img>` reserves
//     NOTHING, so a grid that puts the ratio on the image reflows the whole viewport on decode. A tile WITH a
//     cover and a tile WITHOUT one must occupy the identical box.
//  2. THE SKELETON MATCHES THE SHAPE. The measured failure it replaces is line-shaped skeleton rows under a
//     media feed, which shifted the layout when the real tiles arrived.
//  3. THE COLUMN COUNT IS A CONTAINER QUERY, not a viewport one — this grid lands in panes the shell narrows
//     independently, so a viewport breakpoint would count columns for a width the grid does not have.
//  4. INTERACTIVITY IS ALL-OR-NOTHING. With `onActivate` every tile is a real keyboard-reachable `<button>`;
//     without it NOTHING is focusable — a display grid that traps tab stops is worse than no grid.

import { expect, test } from "@playwright/experimental-ct-react";
import { ActivatableTileGrid, BadgedTileGrid, BasicTileGrid, MixedTileGrid, TaggedTileGrid, TileGridSkeleton } from "./media-tile-grid.fixtures.tsx";

/** Container widths chosen against the grid's own `@container` breakpoints (2 → @md 3 → @2xl 4). */
const NARROW_PX = 320;
const WIDE_PX = 800;
/** Tolerance for a sub-pixel grid track division. */
const EPSILON = 1.5;

test("a tile WITH a cover and one WITHOUT occupy the identical box (the ratio is the TILE's, not the image's)", async ({ mount }) => {
  const component = await mount(<MixedTileGrid widthPx={WIDE_PX} />);
  const has = component.getByText("Has cover");
  const none = component.getByText("No cover");
  await expect(has).toBeVisible();
  await expect(none).toBeVisible();
  const hasBox = await has.boundingBox();
  const noneBox = await none.boundingBox();
  expect(hasBox, "the covered tile must have a box").not.toBeNull();
  expect(noneBox, "the uncovered tile must have a box").not.toBeNull();
  // Same ROW: the titles sit at the same y, which is only true if both covers reserved the same height.
  expect(Math.abs((hasBox?.y ?? 0) - (noneBox?.y ?? 0))).toBeLessThan(EPSILON);
  expect(Math.abs((hasBox?.width ?? 0) - (noneBox?.width ?? 0))).toBeLessThan(EPSILON);
});

test("the SKELETON matches the real grid's shape — same tracks, same reserved cover box", async ({ mount }) => {
  const real = await mount(<BasicTileGrid count={2} widthPx={WIDE_PX} />);
  const realTile = real.locator('[data-slot="media-tile"]').first();
  await expect(realTile).toBeVisible();
  const realBox = await realTile.boundingBox();
  await real.unmount();

  const skeleton = await mount(<TileGridSkeleton widthPx={WIDE_PX} />);
  const skeletonTile = skeleton.locator('[data-slot="media-tile-grid-skeleton"] > div > div').first();
  await expect(skeletonTile).toBeVisible();
  const skeletonBox = await skeletonTile.boundingBox();

  // The whole point of a shape-matched skeleton: the arrival of real data must not move anything.
  expect(Math.abs((realBox?.width ?? 0) - (skeletonBox?.width ?? 0))).toBeLessThan(EPSILON);
  expect(Math.abs((realBox?.x ?? 0) - (skeletonBox?.x ?? 0))).toBeLessThan(EPSILON);
});

test("the column count follows the CONTAINER, not the viewport (a narrow pane gets fewer, wider tiles)", async ({ mount }) => {
  const wide = await mount(<BasicTileGrid count={4} widthPx={WIDE_PX} />);
  const wideTile = await wide.locator('[data-slot="media-tile"]').first().boundingBox();
  await wide.unmount();

  // SAME viewport, NARROWER container. A viewport-breakpoint grid would produce the same column count here and
  // this assertion would be measuring nothing — which is exactly the bug the container query prevents.
  const narrow = await mount(<BasicTileGrid count={4} widthPx={NARROW_PX} />);
  const narrowTile = await narrow.locator('[data-slot="media-tile"]').first().boundingBox();

  expect(wideTile, "the wide grid must have a tile box").not.toBeNull();
  expect(narrowTile, "the narrow grid must have a tile box").not.toBeNull();
  // Fewer columns at 320px than at 800px ⇒ each tile takes a LARGER share of a SMALLER container. The absolute
  // widths are what the pin compares, because the share is what the reader sees.
  expect((narrowTile?.width ?? 0) / NARROW_PX).toBeGreaterThan((wideTile?.width ?? 0) / WIDE_PX);
});

test("with onActivate every tile is a real BUTTON that reports its own id; without it nothing is focusable", async ({ mount, page }) => {
  const interactive = await mount(<ActivatableTileGrid widthPx={WIDE_PX} />);
  const tiles = interactive.getByRole("button");
  await expect(tiles).toHaveCount(3);
  // Keyboard-reachable, and the handler receives the TILE's id — not its index, not its title.
  await tiles.nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(interactive.getByTestId("picked")).toHaveText("t1");
  await interactive.unmount();

  const display = await mount(<BasicTileGrid count={3} widthPx={WIDE_PX} />);
  // A display grid traps no tab stops: no buttons at all, rather than disabled ones.
  await expect(display.getByRole("button")).toHaveCount(0);
  await expect(display.locator('[data-slot="media-tile"]')).toHaveCount(3);
});

test("hub v1.2: an interactive tile's accessible NAME separates title from subtitle, and tag chips render only where tags exist", async ({ mount }) => {
  const component = await mount(<TaggedTileGrid widthPx={WIDE_PX} />);
  // The a11y fix (side-eye 2026-08-29 P3): content-derived naming ran the halves together
  // ("World RPrickrocka · 7.4k↓"); the explicit comma-joined label keeps them distinct.
  await expect(component.getByRole("button", { name: "World RP, rickrocka · 7.4k↓" })).toBeVisible();
  // The chip row renders on the tagged tile ONLY — an untagged tile gets no empty shell.
  const tagRows = component.locator('[data-slot="media-tile-tags"]');
  await expect(tagRows).toHaveCount(1);
  await expect(tagRows.getByText("fantasy")).toBeVisible();
  await expect(tagRows.getByText("vampire")).toBeVisible();
});

// #1698 (side-eye 2026-09-05, the hub-ingested arm). The tile's `aria-label` is EXPLICIT, and an explicit
// name REPLACES the node's content — so the badge, which is the only thing on the tile saying "you already
// have this one", was invisible to a screen reader: every hub result announced identically whether it was
// owned or not, on the surface whose entire job is deciding what to add. The name keeps its comma-joined
// title/subtitle contract (the 2026-08-29 P3 fix, unreversed) and the STATE is appended after the identity.
test("#1698 a badged tile's accessible NAME carries the badge — ownership is not paint-only", async ({ mount }) => {
  const component = await mount(<BadgedTileGrid widthPx={WIDE_PX} />);

  await expect(component.getByRole("button", { name: "Illyria, damagecontrol \u00b7 2.8k\u2193, in your library" })).toBeVisible();
  // The badge is still PAINTED — the name is an addition, not a relocation.
  await expect(component.getByText("in your library")).toBeVisible();
  // …and an unbadged tile's name is unchanged: the state clause exists only where there is a state.
  await expect(component.getByRole("button", { name: "Rebecca, paradigme \u00b7 1.1k\u2193" })).toBeVisible();
});

test("a cover with no `alt` is DECORATIVE — the tile's own title carries the name, never twice", async ({ mount }) => {
  const component = await mount(<MixedTileGrid widthPx={WIDE_PX} />);
  // The covered tile supplies an alt, so its image is named; the uncovered one renders the placeholder glyph
  // and no image at all. Either way the visible TITLE is the tile's name — a duplicate accessible name would
  // be noise a screen-reader user walks past on every tile in the grid.
  await expect(component.getByRole("img", { name: "a cover" })).toBeVisible();
  await expect(component.getByRole("img")).toHaveCount(1);
});
