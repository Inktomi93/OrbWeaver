// character-library-store CT — drives the LIST view-prefs store (FINAL-Character §4/§12) through its module
// actions and asserts each read hook reflects the transition on the real persisted (localStorage-backed)
// store: the §4.5 sort, the §4.3 flat⇄categorized view, the favorites/archived filter chips, the §4.6 bulk
// flag, the AND-tag filter's add/remove/clear, and the spoiler-blur screen-share toggle. `bulkMode` is
// transient (not persisted) — verified only as a live transition here (a reload-persistence assertion
// belongs to the persist factory's own test).

import { expect, test } from "@playwright/experimental-ct-react";
import { CharacterLibraryStoreProbe } from "./_ct-stories";

test("sort + view transitions reflect in the read hooks", async ({ mount }) => {
  const probe = await mount(<CharacterLibraryStoreProbe />);
  const state = probe.locator("output");
  // Defaults: recency sort, flat view, no filters, no bulk.
  await expect(state).toContainText("sort=recent view=flat fav=false archived=false bulk=false");

  await probe.getByRole("button", { name: "sort alpha" }).click();
  await expect(state).toContainText("sort=alpha");

  await probe.getByRole("button", { name: "view categorized" }).click();
  await expect(state).toContainText("view=categorized");
});

test("filter chips + bulk flag toggle independently", async ({ mount }) => {
  const probe = await mount(<CharacterLibraryStoreProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "toggle favorites" }).click();
  await expect(state).toContainText("fav=true");

  await probe.getByRole("button", { name: "toggle archived" }).click();
  await expect(state).toContainText("archived=true");

  await probe.getByRole("button", { name: "enter bulk" }).click();
  await expect(state).toContainText("bulk=true");
});

test("spoiler blur toggles independently of the other filters", async ({ mount }) => {
  const probe = await mount(<CharacterLibraryStoreProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("blur=false");

  await probe.getByRole("button", { name: "toggle spoiler blur" }).click();
  await expect(state).toContainText("blur=true");

  await probe.getByRole("button", { name: "toggle spoiler blur" }).click();
  await expect(state).toContainText("blur=false");
});

// THREE-STATE (the exclusion axis): one tag walks off → include → exclude → off, and `off` is stored as
// the ABSENCE of an entry — a resting filter must persist as `[]`, never as inert rows.
test("the tag filter cycles include → exclude → off, and clears", async ({ mount }) => {
  const probe = await mount(<CharacterLibraryStoreProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("tags=none");

  await probe.getByRole("button", { name: "cycle tag" }).click();
  await expect(state).toContainText("tags=tag_ct_probe:include");

  await probe.getByRole("button", { name: "cycle tag" }).click();
  await expect(state).toContainText("tags=tag_ct_probe:exclude");

  // The third step drops the entry entirely rather than storing an `off` row.
  await probe.getByRole("button", { name: "cycle tag" }).click();
  await expect(state).toContainText("tags=none");

  await probe.getByRole("button", { name: "cycle tag" }).click();
  await probe.getByRole("button", { name: "clear tags" }).click();
  await expect(state).toContainText("tags=none");
});
