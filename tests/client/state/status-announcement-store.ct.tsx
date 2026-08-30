// status-ANNOUNCEMENT store CT (#863 P1) — the imperative live-region channel. The app's only live region
// was route-DERIVED ("Loaded chat."), so a mutation whose result lands off-screen announced nothing at all:
// measured, the region still read the stale route line four seconds after a game-mode toggle, in both
// directions. This store is the event channel `app-root` renders through its ONE `AriaAnnouncer`.
//
// A CT because the read is the reactive hook (`useSyncExternalStore` needs a browser render — the
// composer-focus-store.ct posture). The probe is the game-mode one: this store has exactly one production
// writer family and asserting it through a synthetic second probe would prove less.

import { expect, test } from "@playwright/experimental-ct-react";
import { GameModeTransitionProbe } from "./_ct-stories.tsx";

test("the channel starts EMPTY and carries whatever was last announced (a live region fires on the change)", async ({ mount }) => {
  const probe = await mount(<GameModeTransitionProbe />);
  const state = probe.locator("output");
  // Born empty: a live region inserted with text already in it is not reliably announced, so the app's
  // announcer mounts persistently and starts blank.
  await expect(state).toContainText("say=");
  await expect(state).not.toContainText("say=Loaded chat.");

  await probe.getByRole("button", { name: "announce route" }).click();
  await expect(state).toContainText("say=Loaded chat.");

  // A later announcement REPLACES it — one region, one current message, no queue to leak.
  await probe.getByRole("button", { name: "stop game mode" }).click();
  await expect(state).toContainText("say=Game mode off — your sheets, scene and quests are kept");
});
