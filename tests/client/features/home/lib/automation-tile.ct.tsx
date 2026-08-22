// CT: the AUTOMATION doorway — the honest face of "future stuff" (owner decision H9: home ships NO "more
// coming" placeholder). What earns this tile its pixels is that its channel is REAL: `automation.stream`
// is a sanctioned-dormant SSE seam, so the doorway cites it rather than promising nothing.

import { expect, test } from "@playwright/experimental-ct-react";
import { HomeRealDoorwaysStory } from "../_ct-stories.tsx";

const AUTOMATION_TEASER_RE = /Rules that fire on your rooms/u;
/** The state line, in the USER's terms (rail sweep P1-3): the shipped copy used to be the repo-internal
 *  citation "waiting on: automation.stream through the SSE multiplex (stage 4 …)". */
const AUTOMATION_REASON_RE = /^Half built:/u;
/** The group's fold trigger (#455) — the doorways are behind a disclosure, collapsed by default, so a
 *  tile-level contract is asserted on the OPENED panel. The fold itself is pinned in home-surface.ct.tsx. */
const GROUP_LABEL = "What's coming";

test("automation renders the sanctioned-dormant channel honestly, not an empty promise card", async ({ mount }) => {
  const home = await mount(<HomeRealDoorwaysStory />);
  await home.getByRole("button", { name: GROUP_LABEL }).click();
  const tile = home.locator('[data-home-tile="automation"]');

  await expect(tile.getByText("Automation", { exact: true })).toBeVisible();
  // No per-doorway `Dormant` badge since #102 — the shared group band carries it once for the group
  // (pinned in home-surface.ct.tsx).
  await expect(tile.getByText(AUTOMATION_TEASER_RE)).toBeVisible();
  await expect(tile.getByText(AUTOMATION_REASON_RE)).toBeVisible();
  await expect(tile.getByRole("button")).toHaveCount(0);
  await expect(tile.locator("[aria-busy]")).toHaveCount(0);
});
