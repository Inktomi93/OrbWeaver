// game-mode TRANSITION seam CT (#862/#863) — the ONE home for what a USER-INITIATED game-mode start/stop
// SAYS and REVEALS. It lives in `#state` because its two callers are in different client features (chat's
// ⋯ menu and rpg's Game-tab door) and a feature may never import another; that shared home is exactly why
// the two doors can no longer drift into two vocabularies, which is the defect it was minted for.
//
// A CT, not a unit test: both reads are reactive hooks (`useSyncExternalStore` needs a browser render — the
// composer-focus-store.ct posture), and both are the USER-VISIBLE result — what a screen reader hears, and
// where the context panel lands.

import { expect, test } from "@playwright/experimental-ct-react";
import { GameModeTransitionProbe } from "./_ct-stories.tsx";

test("a START announces itself and reveals its result: the panel opens on the game's Status tab", async ({ mount }) => {
  const probe = await mount(<GameModeTransitionProbe />);
  const state = probe.locator("output");
  await expect(state).toHaveText("say= tab=none panel=unset");

  await probe.getByRole("button", { name: "start game mode" }).click();

  // ONE announcement naming what changed AND where the result is (the user is at the composer, the result
  // lands in the pane on the far edge), plus the deterministic landing — the pre-#863 landing was whatever
  // `contextTab` happened to hold, worst case an empty host-console schema form.
  await expect(state).toHaveText("say=Game mode on — the Game panel is open tab=rpg.status panel=docked");
});

test("a STOP announces the KEPT state and reveals nothing — the surface the user is looking at is what changed", async ({ mount }) => {
  const probe = await mount(<GameModeTransitionProbe />);
  await probe.getByRole("button", { name: "stop game mode" }).click();

  // The reassurance is IN the announcement: the action reads as pause, not end (which is also why no
  // confirm dialog is offered — it is reversible).
  await expect(probe.locator("output")).toHaveText("say=Game mode off — your sheets, scene and quests are kept tab=none panel=unset");
});

test("the live-region channel is ONE region: a later route announcement replaces the transition's", async ({ mount }) => {
  const probe = await mount(<GameModeTransitionProbe />);
  await probe.getByRole("button", { name: "stop game mode" }).click();
  await expect(probe.locator("output")).toContainText("say=Game mode off");

  // `app-root` announces the ROUTE line through this same channel on every navigation, so an event string
  // is replaced by the next navigation rather than lingering as a stale region (the measured pre-fix state
  // was the mirror image: a stale route line that no event could ever displace).
  await probe.getByRole("button", { name: "announce route" }).click();
  await expect(probe.locator("output")).toContainText("say=Loaded chat.");
});
