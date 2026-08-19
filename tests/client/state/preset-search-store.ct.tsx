// preset-SEARCH store CT — the store the Presets LIST keeps its filter text in, driven through its module
// action with the read hook rendered as text. A CT (not a plain unit test) for its corpus sibling's reason:
// the store's only read surface is a reactive hook, and `useSyncExternalStore` needs a real browser render.
//
// WHAT THIS PINS that the surface CT cannot: the query is MODULE-scoped, i.e. it belongs to no component.
// That is the whole reason it is a store — the shell's chrome band (which prints the census) and the rows
// (which render the filtered list) have no common React parent, so a `useState` on the surface left the band
// counting a library the pane was not showing (side-eye 2026-08-19 P2). The end-to-end agreement is pinned
// at the surface, in `tests/client/features/preset/surfaces/preset-library-surface.ct.tsx`.

import { expect, test } from "@playwright/experimental-ct-react";
import { PresetSearchProbe } from "./_ct-stories.tsx";

test("the search text is remembered independently of any component, and clears back to the rest state", async ({ mount }) => {
  const probe = await mount(<PresetSearchProbe />);
  const state = probe.locator("output");
  // Fresh page → the rest state. Session-scoped, never persisted: a reload asks no stale question.
  await expect(state).toHaveText("presetQuery=none");

  await probe.getByRole("button", { name: "set preset query" }).click();
  await expect(state).toHaveText("presetQuery=roleplay");

  // The no-match state's "Clear search" writes exactly this — the box and the filter share one writer.
  await probe.getByRole("button", { name: "clear preset query" }).click();
  await expect(state).toHaveText("presetQuery=none");
});
