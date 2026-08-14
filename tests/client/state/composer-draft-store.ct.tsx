// composer-draft store CT (item-12 restoration) — the draft is MODULE-scoped client state (D70 commons),
// so it survives a component REMOUNT (the "typed text lost on nav/re-render" papercut this store kills).
// The scope key is the room's real ChatId from the creation click, so the draftKey→ChatId MIGRATE this file
// used to pin is gone with draft mode (chat-creation-draft-mode-replacement.md §4.1). A CT (not a unit test)
// because the store's only read surface is the reactive `useComposerDraft` hook (useSyncExternalStore needs
// a browser render — the character-selection-store.ct.tsx posture).
//
// AND IT SURVIVES A RELOAD (owner pick, 2026-08-09). That leg has to be a CT for a second reason: the store
// rehydrates from localStorage at MODULE INIT, so nothing short of a real `page.reload()` can observe it —
// a node test would only ever see the live in-memory map. The reload tests below write through the REAL
// store (a click on the probe), reload the page, and re-mount: that proves BOTH halves (the write landed in
// storage, and the rehydrate reads it back), where seeding localStorage by hand would only prove the second.

import { COMPOSER_DRAFT_CAP } from "@orb/client/state";
import { expect, test } from "@playwright/experimental-ct-react";
import { ComposerDraftProbe } from "./_ct-stories.tsx";

const STORAGE_KEY = "orb:composer-draft";

/** The persisted blob's draft map, read out of the REAL localStorage the store wrote. */
async function storedDrafts(page: { evaluate: <T>(fn: (key: string) => T, key: string) => Promise<T> }): Promise<Record<string, string>> {
  const raw = await page.evaluate((key) => globalThis.localStorage.getItem(key), STORAGE_KEY);
  return raw === null ? {} : ((JSON.parse(raw) as { state?: { drafts?: Record<string, string> } }).state?.drafts ?? {});
}

test("a typed draft survives a reader REMOUNT (module-scoped — the nav papercut is dead)", async ({ mount }) => {
  const probe = await mount(<ComposerDraftProbe />);
  const state = probe.locator("output");
  // Drafts PERSIST now, so "starts empty" is a claim about storage as well as the store — the reset makes
  // it a statement about this test rather than about whatever ran before it.
  await probe.getByRole("button", { name: "reset drafts" }).click();
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

test("readComposerDraft answers the live text outside a render (the husk-reap skip's read)", async ({ mount }) => {
  const probe = await mount(<ComposerDraftProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "type draft" }).click();
  await expect(state).toHaveText("draft=typed but not sent committed=empty");

  // The probe's `read snapshot` copies scope A's text into scope B through the NON-HOOK read — the same
  // read `releaseCreatedChat` makes to decide whether an abandoned room still holds unsent text.
  await probe.getByRole("button", { name: "read snapshot" }).click();
  await expect(state).toHaveText("draft=typed but not sent committed=typed but not sent");
});

test("an unsent draft survives a full page RELOAD (the owner's 2026-08-09 pick)", async ({ mount, page }) => {
  const first = await mount(<ComposerDraftProbe />);
  await expect(first.locator("output")).toHaveText("draft=empty committed=empty");
  await first.getByRole("button", { name: "type draft" }).click();
  await expect(first.locator("output")).toHaveText("draft=typed but not sent committed=empty");

  // The write must have LANDED in storage before the reload — asserting it here is what separates "the
  // store persisted" from "the reload happened to be a no-op".
  const stored = await page.evaluate((key) => globalThis.localStorage.getItem(key), STORAGE_KEY);
  expect(stored).toContain("typed but not sent");

  await page.reload();

  const second = await mount(<ComposerDraftProbe />);
  await expect(second.locator("output")).toHaveText("draft=typed but not sent committed=empty");
});

test("a CLEARED draft leaves nothing to resurrect across a reload (the send-clear arm)", async ({ mount, page }) => {
  const first = await mount(<ComposerDraftProbe />);
  await first.getByRole("button", { name: "type draft" }).click();
  await expect(first.locator("output")).toHaveText("draft=typed but not sent committed=empty");

  // The send-clear writes "" — the ABSENCE of a draft, not a draft of nothing. It must not persist, or a
  // reload after sending would put the sent message back in the composer.
  await first.getByRole("button", { name: "clear draft" }).click();
  await expect(first.locator("output")).toHaveText("draft=empty committed=empty");
  const stored = await page.evaluate((key) => globalThis.localStorage.getItem(key), STORAGE_KEY);
  expect(stored ?? "").not.toContain("typed but not sent");

  await page.reload();

  const second = await mount(<ComposerDraftProbe />);
  await expect(second.locator("output")).toHaveText("draft=empty committed=empty");
});

test("the persisted blob is CAPPED, and it is the least-recently-typed rooms that are evicted", async ({ mount, page }) => {
  const probe = await mount(<ComposerDraftProbe />);
  await probe.getByRole("button", { name: "reset drafts" }).click();
  await probe.getByRole("button", { name: "flood drafts" }).click();

  // EVERY draft typed this session stays live in memory — the cap is a PERSIST bound, not a session limit,
  // and a user with more open rooms than the cap must still see what they typed in all of them.
  await expect(probe.getByText(`live=${String(COMPOSER_DRAFT_CAP + 3)}`)).toBeVisible();

  const drafts = await storedDrafts(page);
  expect(Object.keys(drafts)).toHaveLength(COMPOSER_DRAFT_CAP);
  expect(drafts["cd_flood_0"]).toBeUndefined(); // the three oldest rooms are the ones dropped
  expect(drafts["cd_flood_2"]).toBeUndefined();
  expect(drafts[`cd_flood_${COMPOSER_DRAFT_CAP + 2}`]).toBe(`flood ${COMPOSER_DRAFT_CAP + 2}`);
});

// The #11 autosave doctrine at the draft mirror: an invalid persisted state is DISCARDED, never trusted,
// never allowed to crash. Seeded BEFORE the page's JS runs (`addInitScript`) because the store rehydrates at
// module init — writing localStorage after mount would prove nothing (the shell-store.ct.tsx posture).
test("a corrupt persisted blob boots to an empty composer instead of bricking it", async ({ mount, page }) => {
  await page.addInitScript(() => {
    // Computed keys: the scope keys are DATA (a chat id / a draft key), not identifiers this file names.
    const drafts = { ["cd_scope"]: 42, ["cd_committed"]: "kept" };
    globalThis.localStorage.setItem("orb:composer-draft", JSON.stringify({ state: { drafts }, version: 1 }));
  });
  await page.reload();

  const probe = await mount(<ComposerDraftProbe />);
  // The non-string entry is dropped; the well-formed sibling survives (no over-eager wipe).
  await expect(probe.locator("output")).toHaveText("draft=empty committed=kept");
});
