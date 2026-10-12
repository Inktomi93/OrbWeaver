// analytics-selection store CT — drives the hook-backed store through its module actions and asserts the
// read hook reflects each transition (the Analytics leaderboard drill drives the Analytics CONTENT; kept
// distinct from the Corpus dossier + Characters editor selections). A CT (not a plain unit test) because
// the store's only read surface is the reactive `useSelectedAnalyticsCharacterId` hook — useSyncExternalStore
// needs a real browser render (the corpus-selection-store.ct.tsx posture).

import { expect, test } from "@playwright/experimental-ct-react";
import { AnalyticsSelectionProbe } from "./_ct-stories.tsx";

test("select sets the id; clear resets to none", async ({ mount }) => {
  const probe = await mount(<AnalyticsSelectionProbe />);
  const state = probe.locator("output");
  // Fresh page → nothing drilled (the Analytics CONTENT shows the overview dashboard).
  await expect(state).toHaveText("analytics=none");

  await probe.getByRole("button", { name: "select analytics character" }).click();
  await expect(state).toHaveText("analytics=char_analytics_probe");

  await probe.getByRole("button", { name: "clear analytics selection" }).click();
  await expect(state).toHaveText("analytics=none");
});
