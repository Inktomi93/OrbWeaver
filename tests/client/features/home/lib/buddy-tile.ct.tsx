// CT: the BUDDY doorway — the founding DORMANT home tile, as SHIPPED (the fake-tile CT beside this one
// pins the arm's contract; this pins the real registration, so a doorway that quietly grew a control or
// lost its citation goes red here). Also pins that the doorways sort LAST — a promise must never push a
// working tile below the fold.
//
// A doorway is not an IOU: it names what must land first, it says what the thing will be, and it does NOT
// fake a spinner, a skeleton, or a disabled button.

import { expect, test } from "@playwright/experimental-ct-react";
import { HomeRealDoorwaysStory } from "../_ct-stories.tsx";

const BUDDY_TEASER_RE = /Your companion/u;
const BUDDY_REASON_RE = /waiting on: domain\/buddy/u;

test("buddy renders as a doorway — teaser, tracked reason, Dormant badge, ZERO controls", async ({ mount }) => {
  const home = await mount(<HomeRealDoorwaysStory />);
  const tile = home.locator('[data-home-tile="buddy"]');

  await expect(tile.getByText("Buddy", { exact: true })).toBeVisible();
  await expect(tile.getByText("Dormant")).toBeVisible();
  await expect(tile.getByText(BUDDY_TEASER_RE)).toBeVisible();
  await expect(tile.getByText(BUDDY_REASON_RE)).toBeVisible();
  await expect(tile.getByRole("button")).toHaveCount(0);
  await expect(tile.locator("[aria-busy]")).toHaveCount(0);
});

test("the doorways sort LAST — they never push a working tile below the fold", async ({ mount }) => {
  const home = await mount(<HomeRealDoorwaysStory />);

  const tiles = home.locator("[data-home-tile]");
  await expect(tiles).toHaveCount(2);
  await expect(tiles.nth(0)).toHaveAttribute("data-home-tile", "buddy");
  await expect(tiles.nth(1)).toHaveAttribute("data-home-tile", "automation");
});
