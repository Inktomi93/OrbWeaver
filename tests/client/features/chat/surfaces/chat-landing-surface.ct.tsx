// CT: the Chats-section NO-SELECTION state after the launcher MOVED to home (owner decision H1 = D-1).
// REWRITTEN, not extended: the hero / recents / quick-pick assertions moved to the home-tile CTs beside
// their new owners (`components/home-{recents,quick-picks}-tile-body.ct.tsx`) — a deleted-surface red here
// would be a harness artifact, not a regression.
//
// What this pins is the SLIM state's honesty: it names where you are, it carries the section's own
// primary (a dead-end empty state is the defect the three-states law names), and it does NOT re-grow a
// second launcher — no recents finder, no character faces, and no data read at all.

import { expect, test } from "@playwright/experimental-ct-react";
import { ChatLandingSurfaceStory } from "../_ct-stories.tsx";

test("renders the slim no-selection state — where you are + the section's own primary", async ({ mount }) => {
  const component = await mount(<ChatLandingSurfaceStory />);

  await expect(component.getByText("No chat selected")).toBeVisible();
  // SIDE-AGNOSTIC: the list pane is a docked column, a slide-over, or collapsed — "on the left" was wrong
  // in three of the four states.
  await expect(component.getByText("Pick a thread from your chats, or start a new one.")).toBeVisible();
  await expect(component.getByRole("button", { name: "Start a new chat" })).toBeVisible();
});

// #446 — THE INSTRUCTION IS ONLY PERFORMABLE WHILE THE ROSTER IS ON SCREEN. "Pick a thread from your chats"
// points at a pane the shell auto-collapses in the narrow-desktop band, hides in focus mode, and lets the
// reader collapse by hand. The footnote is CONDITIONALLY RENDERED off the shell's own resolved list mode —
// never printed as an unconditional "if" — and it names the topbar's control verbatim. Both arms, ONE mount.
const LIST_PANEL_DOOR = /Show list panel in the top bar/u;

test("#446 the list-door footnote appears only while the roster is off screen", async ({ mount }) => {
  const component = await mount(<ChatLandingSurfaceStory />);
  await expect(component.getByText("Pick a thread from your chats, or start a new one.")).toBeVisible();
  await expect(component.getByText(LIST_PANEL_DOOR)).toHaveCount(0);

  await component.getByRole("button", { name: "take the list off screen" }).click();
  await expect(component.getByText(LIST_PANEL_DOOR)).toBeVisible();
  // The section's own primary stands in BOTH arms — no arm is a dead end, and no second door is minted.
  await expect(component.getByRole("button", { name: "Start a new chat" })).toBeVisible();

  await component.getByRole("button", { name: "put the list back" }).click();
  await expect(component.getByText(LIST_PANEL_DOOR)).toHaveCount(0);
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
  // (Matched WITHOUT the trailing arrow: it is a decorative `aria-hidden` span since the 2026-08-17 rail
  // sweep, so the old literal would pass here for the wrong reason — an absence test that cannot fail.)
  await expect(component.getByText("All characters")).toHaveCount(0);
  // The old hero copy is gone with it — one launcher, one voice.
  await expect(component.getByText("Pick up a thread")).toHaveCount(0);
});
