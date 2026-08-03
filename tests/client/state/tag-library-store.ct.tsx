// tag-library-store CT — the tag roster's per-device sort mode on the real persisted (localStorage-backed)
// store. The DEFAULT is the load-bearing assertion: the owner's ask was "most-used", and a store that
// silently opened on `manual` would leave a ~400-tag library reading in an authored order the ≤30 drag cap
// makes unreachable to author.

import { expect, test } from "@playwright/experimental-ct-react";
import { TagLibraryProbe } from "./_ct-stories.tsx";

test("the roster defaults to MOST-USED and each mode is reachable", async ({ mount }) => {
  const probe = await mount(<TagLibraryProbe />);
  const state = probe.locator("output");
  await expect(state).toHaveText("sort=used");

  await probe.getByRole("button", { name: "sort alpha" }).click();
  await expect(state).toHaveText("sort=alpha");

  // Manual is NOT retired — it stays reachable beside the two derived modes (owner ruling 2026-08-03).
  await probe.getByRole("button", { name: "sort manual" }).click();
  await expect(state).toHaveText("sort=manual");

  await probe.getByRole("button", { name: "sort used" }).click();
  await expect(state).toHaveText("sort=used");
});
