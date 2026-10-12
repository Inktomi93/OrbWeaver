// character-library-store CT — drives the LIST view-prefs store (FINAL-Character §4/§12) through its module
// actions and asserts each read hook reflects the transition on the real persisted (localStorage-backed)
// store: the §4.5 sort, the §4.3 flat⇄categorized view, the favorites/archived filter chips, the §4.6 bulk
// flag, the AND-tag filter's add/remove/clear, and the spoiler-blur screen-share toggle. `bulkMode` is
// transient (not persisted) — verified only as a live transition here (a reload-persistence assertion
// belongs to the persist factory's own test).
//
// The `browseOffset` pins that stood here (#255 — the scroll position rescued across the LIST pane's
// selection swap, and its absence from the persisted blob) went with the seam: #501 stopped the pane
// swapping, so nothing unmounts the library and there is no position to carry. Deleted rather than
// re-pointed — there is no replacement behaviour at the STORE tier to assert.

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
// a rail round trip and a reload, exactly like the sort and the view mode beside it. Default `false`: the
// collapsed rail is what gave the 320-character library back its vertical space and its keyboard.
test("toggleFiltersOpen flips the rail's disclosure, and the posture PERSISTS (it is a preference, not a mode)", async ({ mount, page }) => {
  const probe = await mount(<CharacterLibraryStoreProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("filtersOpen=false");

  await probe.getByRole("button", { name: "toggle filters open" }).click();
  await expect(state).toContainText("filtersOpen=true");

  // …and it reaches the persisted blob (unlike `bulkMode`, which is transient by design).
  const stored = await page.evaluate((key) => globalThis.localStorage.getItem(key), STORAGE_KEY);
  expect(stored ?? "").toContain('"filtersOpen":true');

  await probe.getByRole("button", { name: "toggle filters open" }).click();
  await expect(state).toContainText("filtersOpen=false");
});

// #518 — the pane's SEARCH text lives here now, because the LIST chrome band prints the census and is a
// sibling shell region with no shared React ancestor: while it was `useState` inside the surface the band
// could only ever print the unnarrowed library total over a filtered list. It is TRANSIENT like `bulkMode`
// (a reload landing on the unfiltered library is right, and the `chat-list-filter-store` twin agrees), so
// the pin is the live transition PLUS its absence from the persisted blob.
test("setCharacterSearch drives the pane's search text, and it is deliberately NOT persisted", async ({ mount, page }) => {
  const probe = await mount(<CharacterLibraryStoreProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("search=none");

  await probe.getByRole("button", { name: "search tamsin" }).click();
  await expect(state).toContainText("search=tamsin");

  const stored = await page.evaluate((key) => globalThis.localStorage.getItem(key), STORAGE_KEY);
  expect(stored ?? "").not.toContain("tamsin");

  await probe.getByRole("button", { name: "clear search" }).click();
  await expect(state).toContainText("search=none");
});
