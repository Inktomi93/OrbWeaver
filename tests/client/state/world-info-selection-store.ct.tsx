// world-info-selection store CT — drives the hook-backed store through its module actions and asserts the
// read hooks reflect each transition (World Info: LIST selection drives the CONTENT editor; the drilled entry
// selection drives the entry form). A CT (not a plain unit test) because the store's only read surface is the
// reactive `useSelectedWorldBookId` / `useSelectedWorldEntryId` hooks — useSyncExternalStore needs a real
// browser render (the preset-selection-store.ct.tsx posture). Also covers the LIST-callback dual-write
// `selectWorldBookFromList`, which additionally closes the shell's open LIST slide-over.

import { expect, test } from "@playwright/experimental-ct-react";
import { WorldInfoSelectionProbe } from "./_ct-stories";

test("select sets the book id; clear resets to none", async ({ mount }) => {
  const probe = await mount(<WorldInfoSelectionProbe />);
  const state = probe.locator("output");
  // Fresh page → nothing selected (the World Info CONTENT shows the welcome state).
  await expect(state).toHaveText("book=none entry=none openOverlayPanel=none");

  await probe.getByRole("button", { name: "select book", exact: true }).click();
  await expect(state).toHaveText("book=world_book_ct_probe entry=none openOverlayPanel=none");

  await probe.getByRole("button", { name: "clear book selection" }).click();
  await expect(state).toHaveText("book=none entry=none openOverlayPanel=none");
});

test("select/clear entry drives the entry editor selection reactively", async ({ mount }) => {
  const probe = await mount(<WorldInfoSelectionProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "select book", exact: true }).click();
  await probe.getByRole("button", { name: "select entry", exact: true }).click();
  await expect(state).toHaveText(
    "book=world_book_ct_probe entry=world_entry_ct_probe openOverlayPanel=none",
  );

  await probe.getByRole("button", { name: "clear entry", exact: true }).click();
  await expect(state).toHaveText("book=world_book_ct_probe entry=none openOverlayPanel=none");
});

test("selecting a book clears a stale entry (no carry across books)", async ({ mount }) => {
  const probe = await mount(<WorldInfoSelectionProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "select entry", exact: true }).click();
  await expect(state).toHaveText("book=none entry=world_entry_ct_probe openOverlayPanel=none");

  // Opening a book must wipe the dangling entry selection.
  await probe.getByRole("button", { name: "select book", exact: true }).click();
  await expect(state).toHaveText("book=world_book_ct_probe entry=none openOverlayPanel=none");
});

test("selectWorldBookFromList selects AND closes the LIST slide-over", async ({ mount }) => {
  const probe = await mount(<WorldInfoSelectionProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "open list sheet" }).click();
  await expect(state).toContainText("openOverlayPanel=list");

  await probe.getByRole("button", { name: "select book from list" }).click();
  await expect(state).toHaveText("book=world_book_ct_probe entry=none openOverlayPanel=none");
});
