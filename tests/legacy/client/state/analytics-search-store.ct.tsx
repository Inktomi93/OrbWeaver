// analytics-SEARCH store CT — the store the Analytics leaderboard keeps its filter text in, driven through
// its module action with the read hook rendered as text. A CT (not a plain unit test) for its preset/corpus
// siblings' reason: the store's only read surface is a reactive hook, and `useSyncExternalStore` needs a
// real browser render.
//
// WHAT THIS PINS that the surface CT cannot: the query is MODULE-scoped, i.e. it belongs to no component.
// That is the whole reason it is a store — the shell's chrome band (which prints the "N of M matches"
// census) and the leaderboard rows (which render the filtered page) have no common React parent, so a
// `useState` on the surface left the band counting the whole population beside a handful of filtered rows.
// SESSION-SCOPED, never persisted: a rail bounce restores the search, a hard reload lands on the rest state.

import { expect, test } from "@playwright/experimental-ct-react";
import { AnalyticsSearchProbe } from "./_ct-stories.tsx";

test("the search text is remembered independently of any component, and clears back to the rest state", async ({ mount }) => {
  const probe = await mount(<AnalyticsSearchProbe />);
  const state = probe.locator("output");
  // Fresh page → the rest state (`query === ""` shows the full ranked page). Session-scoped, never persisted.
  await expect(state).toHaveText("analyticsQuery=none");

  await probe.getByRole("button", { name: "set analytics query" }).click();
  await expect(state).toHaveText("analyticsQuery=dragons");

  // The empty-state "Clear" writes exactly this — the box and the filter share one writer, back to rest.
  await probe.getByRole("button", { name: "clear analytics query" }).click();
  await expect(state).toHaveText("analyticsQuery=none");
});
