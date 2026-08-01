// HomeSurface CT — the DOOR seam (home-section-spec §8.1): tiles arrive as a hand-built contributor
// registry of fakes and the REAL grid renders them. What this pins is the seam's contract, not pixels:
// the `(order, id)` sort, `useVisible:false` ⇒ NO DOM, the dormant arm's zero-control doorway, the
// zero-tile empty state, and the duplicate-id THROW at construction.

import type { HomeTileContribution } from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";
import { Clock } from "@orb/ui/icons";
import { expect, test } from "@playwright/experimental-ct-react";
import { HomeDormantTileStory, HomeEmptyStory, HomeTileOrderStory, HomeTileVisibilityStory } from "../_ct-stories";

const TEASER_RE = /Your companion/u;
const REASON_RE = /waiting on: domain\/buddy/u;
const DUPLICATE_ID_RE = /duplicate contributor id "same"/u;

test("tiles render in (order, id), not door-array order", async ({ mount }) => {
  const home = await mount(<HomeTileOrderStory />);

  const tiles = home.locator("[data-home-tile]");
  await expect(tiles).toHaveCount(3);
  // Declared z-third(30), a-first(10), b-second(20) — rendered first, second, third.
  await expect(tiles.nth(0)).toHaveAttribute("data-home-tile", "a-first");
  await expect(tiles.nth(1)).toHaveAttribute("data-home-tile", "b-second");
  await expect(tiles.nth(2)).toHaveAttribute("data-home-tile", "z-third");
});

test("a `useVisible:false` tile renders NOTHING — no gap, no empty card", async ({ mount }) => {
  const home = await mount(<HomeTileVisibilityStory />);

  await expect(home.locator("[data-home-tile]")).toHaveCount(3);
  await expect(home.locator('[data-home-tile="hidden"]')).toHaveCount(0);
  await expect(home.getByText("Hidden tile")).toHaveCount(0);
});

test("a DORMANT tile is a doorway: teaser + Dormant badge + reason, and ZERO interactive elements", async ({ mount }) => {
  const home = await mount(<HomeDormantTileStory />);

  const tile = home.locator('[data-home-tile="dormant"]');
  await expect(tile).toBeVisible();
  await expect(tile.getByText("Dormant")).toBeVisible();
  await expect(tile.getByText(TEASER_RE)).toBeVisible();
  await expect(tile.getByText(REASON_RE)).toBeVisible();
  // The doorway does not fake a control, a spinner, or a skeleton.
  await expect(tile.getByRole("button")).toHaveCount(0);
  await expect(tile.locator("[aria-busy]")).toHaveCount(0);
});

test("ZERO contributions renders the designed empty state with its action, never a blank grid", async ({ mount }) => {
  const home = await mount(<HomeEmptyStory />);

  await expect(home.getByText("Nothing on your home yet")).toBeVisible();
  await expect(home.getByRole("button", { name: "New chat" })).toBeVisible();
  await expect(home.locator("[data-home-tile]")).toHaveCount(0);
});

test("a duplicate tile id THROWS at door construction — the seam never silently shadows a tile", () => {
  const dup: HomeTileContribution = { id: "same", title: "T", icon: Clock, body: () => null };
  expect(() => createContributorRegistry<HomeTileContribution>("home-tiles", [dup, { ...dup, title: "Other" }])).toThrow(DUPLICATE_ID_RE);
});
