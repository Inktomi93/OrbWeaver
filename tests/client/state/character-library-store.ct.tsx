// character-library-store CT — drives the LIST view-prefs store (FINAL-Character §4/§12) through its module
// actions and asserts each read hook reflects the transition on the real persisted (localStorage-backed)
// store: the §4.5 sort, the §4.3 flat⇄categorized view, the favorites/archived filter chips, the §4.6 bulk
// flag, the AND-tag filter's add/remove/clear, and the spoiler-blur screen-share toggle. `bulkMode` is
// transient (not persisted) — verified only as a live transition here (a reload-persistence assertion
// belongs to the persist factory's own test). `browseOffset` (#255) is likewise transient — its round trip
// is proven through the probe's `output` (module state, no hook needed for the getter), and its ABSENCE
// from the persisted blob is proven against the real localStorage the store wrote (the composer-draft-store
// posture) — never through a mock.

import { expect, test } from "@playwright/experimental-ct-react";
import { CharacterLibraryStoreProbe } from "./_ct-stories.tsx";

const STORAGE_KEY = "orb:character-library";

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

// The library's filtered-empty state offers ONE way out (UI-Arch §4.3 rule 1), and this is the action
// behind it: every NARROWING chip drops at once. `showArchived` is deliberately untouched — its OFF state
// is the resting library, not a narrowing anyone needs rescuing from.
test("clearCharacterFilters drops favorites + tags in one act, and leaves the archived toggle alone", async ({ mount }) => {
  const probe = await mount(<CharacterLibraryStoreProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "toggle favorites" }).click();
  await probe.getByRole("button", { name: "toggle archived" }).click();
  await probe.getByRole("button", { name: "cycle tag" }).click();
  await expect(state).toContainText("fav=true archived=true bulk=false tags=tag_ct_probe:include");

  await probe.getByRole("button", { name: "clear filters" }).click();
  await expect(state).toContainText("fav=false archived=true");
  await expect(state).toContainText("tags=none");
});

// #491 — the filter rail's vocabulary is a DISCLOSURE, and its posture is a browse PREFERENCE: it survives
// the pane swap (opening a character unmounts the whole library surface) and a reload, exactly like the sort
// and the view mode beside it. Default `false`: the collapsed rail is what gave the 327-character library
// back its vertical space and its keyboard.
test("toggleFiltersOpen flips the rail's disclosure, and the posture PERSISTS (it is a preference, not a mode)", async ({ mount, page }) => {
  const probe = await mount(<CharacterLibraryStoreProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("filtersOpen=false");

  await probe.getByRole("button", { name: "toggle filters open" }).click();
  await expect(state).toContainText("filtersOpen=true");

  // …and it reaches the persisted blob (unlike `bulkMode`/`browseOffset`, which are transient by design).
  const stored = await page.evaluate((key) => globalThis.localStorage.getItem(key), STORAGE_KEY);
  expect(stored ?? "").toContain('"filtersOpen":true');

  await probe.getByRole("button", { name: "toggle filters open" }).click();
  await expect(state).toContainText("filtersOpen=false");
});

// #255: the browse-offset round trip. The getter is a one-shot mount-time READ (never a hook — see the
// store's own header), so the probe fires it on demand rather than rendering it reactively; that is exactly
// how the real caller (the list's remount) uses it. `browseOffset` is transient BY DESIGN — a reload is a
// fresh browse, so the value must never resurrect from a persisted blob (see below).
test("setCharacterBrowseOffset writes, getCharacterBrowseOffset reads it back on demand", async ({ mount }) => {
  const probe = await mount(<CharacterLibraryStoreProbe />);
  await expect(probe.getByText("browseOffset=unread")).toBeVisible();

  await probe.getByRole("button", { name: "set browse offset" }).click();
  await probe.getByRole("button", { name: "read browse offset" }).click();
  await expect(probe.getByText("browseOffset=240")).toBeVisible();
});

test("browseOffset is TRANSIENT — it never reaches the persisted localStorage blob", async ({ mount, page }) => {
  const probe = await mount(<CharacterLibraryStoreProbe />);
  await probe.getByRole("button", { name: "set browse offset" }).click();
  await probe.getByRole("button", { name: "read browse offset" }).click();
  await expect(probe.getByText("browseOffset=240")).toBeVisible();

  // The write landed in the live store (proven above) but `partialize` excludes it — the persisted blob
  // must not carry the field at all, the same posture composer-draft-store.ct.tsx proves for its own
  // transient bound.
  const stored = await page.evaluate((key) => globalThis.localStorage.getItem(key), STORAGE_KEY);
  expect(stored ?? "").not.toContain("browseOffset");
});
