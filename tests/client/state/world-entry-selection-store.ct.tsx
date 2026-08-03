// world-ENTRY selection store CT — drives the hook-backed store through its module actions and asserts the
// read hook reflects each transition (an entry-row click reveals its field editor; clearing returns to the
// entry list). A CT (not a plain unit test) because the store's only read surface is the reactive
// `useSelectedWorldEntryId` hook — useSyncExternalStore needs a real browser render (the
// preset-selection-store.ct.tsx posture).
//
// The BOOK half is GONE from this store: World Info left the rail at R2, so the open book is the config
// workspace's kinded member selection (`config-selection-store.ct.tsx` covers it) and this store is the
// entry drill alone.

import { expect, test } from "@playwright/experimental-ct-react";
import { WorldEntrySelectionProbe } from "./_ct-stories.tsx";

test("select sets the entry id; clear resets to none", async ({ mount }) => {
  const probe = await mount(<WorldEntrySelectionProbe />);
  const state = probe.locator("output");
  // Fresh page → nothing drilled (the member editor shows the book's entry list).
  await expect(state).toHaveText("entry=none");

  await probe.getByRole("button", { name: "select entry", exact: true }).click();
  await expect(state).toHaveText("entry=world_entry_ct_probe");

  await probe.getByRole("button", { name: "clear entry", exact: true }).click();
  await expect(state).toHaveText("entry=none");
});
