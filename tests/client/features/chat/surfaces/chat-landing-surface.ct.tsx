// CT: the Chats-section NO-SELECTION state after the launcher MOVED to home (owner decision H1 = D-1).
// REWRITTEN, not extended: the hero / recents / quick-pick assertions moved to the home-tile CTs beside
// their new owners (`components/home-{recents,quick-picks}-tile-body.ct.tsx`) — a deleted-surface red here
// would be a harness artifact, not a regression.
//
// What this pins is the SLIM state's honesty: it names where you are, it carries the section's own
// primary (a dead-end empty state is the defect the three-states law names), and it does NOT re-grow a
// second launcher — no recents finder, no character faces, and no data read at all.

import { expect, test } from "@playwright/experimental-ct-react";
import { ChatLandingSurfaceStory } from "../_ct-stories";

test("renders the slim no-selection state — where you are + the section's own primary", async ({ mount }) => {
  const component = await mount(<ChatLandingSurfaceStory />);

  await expect(component.getByText("No chat selected")).toBeVisible();
  // SIDE-AGNOSTIC: the list pane is a docked column, a slide-over, or collapsed — "on the left" was wrong
  // in three of the four states.
  await expect(component.getByText("Pick a thread from your chats, or start a new one.")).toBeVisible();
  await expect(component.getByRole("button", { name: "Start a new chat" })).toBeVisible();
});

test("the primary fires onNewChat", async ({ mount, page }) => {
  const component = await mount(<ChatLandingSurfaceStory />);
  await component.getByRole("button", { name: "Start a new chat" }).click();

  await expect(page.getByTestId("new-count")).toHaveText("1");
});

test("the landing does NOT re-grow a second launcher — the recents finder and the faces live on home", async ({ mount }) => {
  const component = await mount(<ChatLandingSurfaceStory />);

  await expect(component.getByText("Recent chats")).toHaveCount(0);
  await expect(component.getByText("Start a chat")).toHaveCount(0);
  await expect(component.getByText("All characters →")).toHaveCount(0);
  // The old hero copy is gone with it — one launcher, one voice.
  await expect(component.getByText("Pick up a thread")).toHaveCount(0);
});
