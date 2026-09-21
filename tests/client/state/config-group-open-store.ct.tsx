// config-group-open store CT — the per-device DISCLOSURE memory for the Configuration roster's groups.
//
// The owner ruling this pins: groups start COLLAPSED (a ~400-row tag library expanded by default buries
// every sibling collection, and the roster's job is to be the map of what exists). `openConfigGroup` is
// IDEMPOTENT — it may never collapse a group already open — and `closeConfigGroup` undoes an auto-open.

import { expect, test } from "@playwright/experimental-ct-react";
import { ConfigGroupOpenProbe } from "./_ct-stories.tsx";

test("openConfigGroup is idempotent — the deep-link arm never closes an open group", async ({ mount }) => {
  const probe = await mount(<ConfigGroupOpenProbe />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "reset collection groups" }).click();

  await probe.getByRole("button", { name: "open tags group" }).click();
  await expect(state).toHaveText("tags=true regex=false");

  await probe.getByRole("button", { name: "open tags group" }).click();
  await expect(state).toHaveText("tags=true regex=false");
});

// `closeConfigGroup` is the AUTO-OPEN's undo (#1217) — the arrival default expands a group nobody asked for,
// so it needs a way to put that back without touching what the READER opened. It is the mirror of
// `openConfigGroup`: idempotent, and it collapses exactly the one group it names.
test("closeConfigGroup collapses ONE group, and does nothing to a group already closed", async ({ mount }) => {
  const probe = await mount(<ConfigGroupOpenProbe />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "reset collection groups" }).click();

  await probe.getByRole("button", { name: "open tags group" }).click();
  await expect(state).toHaveText("tags=true regex=false");

  await probe.getByRole("button", { name: "close tags group" }).click();
  await expect(state).toHaveText("tags=false regex=false");

  // Idempotent, exactly like its opening twin: closing a closed group is not a toggle.
  await probe.getByRole("button", { name: "close tags group" }).click();
  await expect(state).toHaveText("tags=false regex=false");
});
