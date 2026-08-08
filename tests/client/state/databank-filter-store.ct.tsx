// databank-filter store CT — the phase SCOPE home's ingest-health chips write and the Databank LIST reads
// (side-eye 2026-08-08 P2-a). A CT, not a unit test, because the store's only read surface is the reactive
// `useDatabankPhaseFilter` hook — `useSyncExternalStore` needs a real browser render (the
// chat-list-filter-store.ct.tsx posture, which this store mirrors in shape and in purpose).

import { expect, test } from "@playwright/experimental-ct-react";
import { DatabankFilterProbe } from "./_ct-stories.tsx";

test("a phase scope is set, REPLACED, and cleared — one scope at a time, never a stack", async ({ mount }) => {
  const probe = await mount(<DatabankFilterProbe />);
  const state = probe.locator("output");
  // Fresh page → the whole bank. The scope is deliberately NOT persisted: a triage scope that survives a
  // restart is a filter the user has forgotten is on.
  await expect(state).toHaveText("phase=none");

  await probe.getByRole("button", { name: "scope to stalled" }).click();
  await expect(state).toHaveText("phase=stalled");

  // A second chip REPLACES the scope rather than intersecting with it — two phases at once would be a
  // filter no chip on the tile can express, and no affordance could clear half of.
  await probe.getByRole("button", { name: "scope to empty" }).click();
  await expect(state).toHaveText("phase=empty");

  await probe.getByRole("button", { name: "clear scope" }).click();
  await expect(state).toHaveText("phase=none");
});
