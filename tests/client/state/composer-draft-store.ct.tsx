// composer-draft store CT (item-12 restoration) — the draft is MODULE-scoped client state (D70 commons),
// so it survives a component REMOUNT (the "typed text lost on nav/re-render" papercut this store kills) and
// MIGRATES across the draftKey → ChatId scope flip on a draft→committed promotion. A CT (not a unit test)
// because the store's only read surface is the reactive `useComposerDraft` hook (useSyncExternalStore needs
// a browser render — the character-selection-store.ct.tsx posture).

import { expect, test } from "@playwright/experimental-ct-react";
import { ComposerDraftProbe } from "./_ct-stories";

test("a typed draft survives a reader REMOUNT (module-scoped — the nav papercut is dead)", async ({ mount }) => {
  const probe = await mount(<ComposerDraftProbe />);
  const state = probe.locator("output");
  await expect(state).toHaveText("draft=empty committed=empty");

  await probe.getByRole("button", { name: "type draft" }).click();
  await expect(state).toHaveText("draft=typed but not sent committed=empty");

  // Unmount the reader (a surface remount / nav away) then remount it — the store outlives the component,
  // so the typed text is STILL there (a plain useState would have been wiped to "").
  await probe.getByRole("button", { name: "unmount reader" }).click();
  await expect(state).toHaveText("reader unmounted");
  await probe.getByRole("button", { name: "remount reader" }).click();
  await expect(state).toHaveText("draft=typed but not sent committed=empty");
});

test("draft→committed promotion MIGRATES the text across the scope-key flip", async ({ mount }) => {
  const probe = await mount(<ComposerDraftProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "type draft" }).click();
  await expect(state).toHaveText("draft=typed but not sent committed=empty");

  // The optimistic send flips draftKey → ChatId; the migrate carries the in-flight text to the new scope
  // (visible through the promotion) and empties the old one.
  await probe.getByRole("button", { name: "migrate to committed" }).click();
  await expect(state).toHaveText("draft=empty committed=typed but not sent");
});
