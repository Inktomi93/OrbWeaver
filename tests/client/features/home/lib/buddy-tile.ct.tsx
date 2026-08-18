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
/** The state line, in the USER's terms (rail sweep P1-3): the shipped copy used to be the repo-internal
 *  citation "waiting on: domain/buddy (not in the retro tree) · the agent-role connection". */
const BUDDY_REASON_RE = /^Not started yet/u;

test("buddy renders as a doorway — name, teaser, tracked reason, ZERO controls", async ({ mount }) => {
  // The per-doorway `Dormant` BADGE went with #102: home now collects every declared doorway under one
  // "Not yet" band, so the group's name says once what a badge per doorway said N times. That band is
  // pinned in home-surface.ct.tsx; what stays THIS tile's own contract is everything below.
  const home = await mount(<HomeRealDoorwaysStory />);
  const tile = home.locator('[data-home-tile="buddy"]');

  await expect(tile.getByText("Buddy", { exact: true })).toBeVisible();
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
