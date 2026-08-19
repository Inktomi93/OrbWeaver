// corpus-SEARCH store CT — the store the Corpus omnibox keeps its query and target in, driven through its
// module actions with the read hooks rendered as text. A CT (not a plain unit test) for the same reason as
// its selection sibling: the store's only read surface is a reactive hook, and `useSyncExternalStore` needs
// a real browser render.
//
// WHAT THIS PINS that the surface CT cannot: the two values are INDEPENDENT and module-scoped — a target
// written without a query survives on its own, and neither is reset by the other. That independence is what
// makes the rail bounce restore both (side-eye corpus re-pass 2026-08-19, U1); the end-to-end restore is
// pinned at the surface, in `tests/client/features/discovery/surfaces/corpus-list-surface.ct.tsx`.

import { expect, test } from "@playwright/experimental-ct-react";
import { CorpusSearchProbe } from "./_ct-stories.tsx";

test("the query and the target are remembered independently of any component", async ({ mount }) => {
  const probe = await mount(<CorpusSearchProbe />);
  const state = probe.locator("output");
  // Fresh page → the rest state, and NO target id: the axis owns its own default, so the store never
  // re-spells "characters" (`resolveSearchTarget` maps the empty id to the first target).
  await expect(state).toHaveText("q=none target=none");

  await probe.getByRole("button", { name: "set corpus target" }).click();
  await expect(state).toHaveText("q=none target=digests");

  await probe.getByRole("button", { name: "set corpus query" }).click();
  await expect(state).toHaveText("q=forest target=digests");

  // Clearing the words keeps the target — a user who empties the box has not changed what they search.
  await probe.getByRole("button", { name: "clear corpus query" }).click();
  await expect(state).toHaveText("q=none target=digests");
});
