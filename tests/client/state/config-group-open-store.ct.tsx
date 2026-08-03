// config-group-open store CT — the per-device DISCLOSURE memory for the Configuration roster's groups.
//
// The owner ruling this pins: groups start COLLAPSED (a ~400-row tag library expanded by default buries
// every sibling collection, and the roster's job is to be the map of what exists), a toggle flips exactly
// one group, and `openCollectionGroup` is IDEMPOTENT — it is the deep-link arm, so it may never collapse a
// group the user already has open.

import { expect, test } from "@playwright/experimental-ct-react";
import { ConfigGroupOpenProbe } from "./_ct-stories.tsx";

test("every group starts collapsed; a toggle flips ONE of them", async ({ mount }) => {
  const probe = await mount(<ConfigGroupOpenProbe />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "reset collection groups" }).click();
  await expect(state).toHaveText("tags=false regex=false");

  await probe.getByRole("button", { name: "toggle tags group" }).click();
  await expect(state).toHaveText("tags=true regex=false");

  await probe.getByRole("button", { name: "toggle tags group" }).click();
  await expect(state).toHaveText("tags=false regex=false");
});

test("openCollectionGroup is idempotent — the deep-link arm never closes an open group", async ({ mount }) => {
  const probe = await mount(<ConfigGroupOpenProbe />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "reset collection groups" }).click();

  await probe.getByRole("button", { name: "open tags group" }).click();
  await expect(state).toHaveText("tags=true regex=false");

  await probe.getByRole("button", { name: "open tags group" }).click();
  await expect(state).toHaveText("tags=true regex=false");
});
