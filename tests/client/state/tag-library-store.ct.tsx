// tag-library-store CT — the tag library's per-device UI state on the real persisted (localStorage-backed)
// store. The sort DEFAULT is the load-bearing assertion: the owner's ask was "most-used", and a store that
// silently opened on `manual` would leave a ~400-tag library reading in an authored order the ≤30 drag cap
// makes unreachable to author.

import { expect, test } from "@playwright/experimental-ct-react";
import { TagLibraryProbe } from "./_ct-stories.tsx";

test("the roster defaults to MOST-USED and each mode is reachable", async ({ mount }) => {
  const probe = await mount(<TagLibraryProbe />);
  // Two `<output>`s since #1725 (sort, then the prune flag) — the first is the sort state.
  const state = probe.locator("output").first();
  await expect(state).toHaveText("sort=used");

  await probe.getByRole("button", { name: "sort alpha" }).click();
  await expect(state).toHaveText("sort=alpha");

  // Manual is NOT retired — it stays reachable beside the two derived modes (owner ruling 2026-08-03).
  await probe.getByRole("button", { name: "sort manual" }).click();
  await expect(state).toHaveText("sort=manual");

  await probe.getByRole("button", { name: "sort used" }).click();
  await expect(state).toHaveText("sort=used");
});

// THE PRUNE CONFIRM'S OPEN FLAG (#1725) — the wire between two fibers the host mounts as siblings: "Prune
// unused tags" is a `CollectionContribution.actions` entry the HOST draws in the library's overflow, and the
// confirm it opens stays with the ROWS, which are the only party that knows the unused count and the
// cascade. It starts CLOSED, which is the half that matters: it is excluded from the store's `partialize`,
// so no reload and no rehydrate can bring back an open destructive dialog.
test("the prune confirm starts closed and both directions of its flag land", async ({ mount }) => {
  const probe = await mount(<TagLibraryProbe />);
  const prune = probe.locator("output").nth(1);
  await expect(prune).toHaveText("prune=false");

  await probe.getByRole("button", { name: "open prune" }).click();
  await expect(prune).toHaveText("prune=true");

  await probe.getByRole("button", { name: "close prune" }).click();
  await expect(prune).toHaveText("prune=false");
});
