// preset-selection store CT — drives the hook-backed store through its module actions and asserts the read
// hook reflects each transition (W10: LIST selection drives the Presets CONTENT editor). A CT (not a plain
// unit test) because the store's only read surface is the reactive `useSelectedPresetId` hook —
// useSyncExternalStore needs a real browser render (the character-selection-store.ct.tsx posture; no
// non-reactive snapshot escape hatch exists, and adding one would be API surface no consumer needs). Also
// covers the LIST-callback dual-writes `selectPresetFromList`/`dismissPresetSection`, which additionally
// close the shell's mobile sheet (mirrors ActiveChatStoreProbe's `selectChatFromList` coverage).

import { expect, test } from "@playwright/experimental-ct-react";
import { PresetSelectionProbe } from "./_ct-stories";

test("select sets the id; clear resets to none", async ({ mount }) => {
  const probe = await mount(<PresetSelectionProbe />);
  const state = probe.locator("output");
  // Fresh page → nothing selected (the Presets CONTENT shows the welcome state).
  await expect(state).toHaveText("selected=none section=none mobileSheet=none");

  await probe.getByRole("button", { name: "select preset", exact: true }).click();
  await expect(state).toHaveText("selected=preset_ct_probe section=none mobileSheet=none");

  await probe.getByRole("button", { name: "clear preset selection" }).click();
  await expect(state).toHaveText("selected=none section=none mobileSheet=none");
});

test("select/clear section drives the inspector selection reactively", async ({ mount }) => {
  const probe = await mount(<PresetSelectionProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "select preset", exact: true }).click();
  await probe.getByRole("button", { name: "select section", exact: true }).click();
  await expect(state).toHaveText("selected=preset_ct_probe section=sec_probe mobileSheet=none");

  await probe.getByRole("button", { name: "clear section", exact: true }).click();
  await expect(state).toHaveText("selected=preset_ct_probe section=none mobileSheet=none");
});

test("selecting a preset clears a stale section (no carry across presets)", async ({ mount }) => {
  const probe = await mount(<PresetSelectionProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "select section", exact: true }).click();
  await expect(state).toHaveText("selected=none section=sec_probe mobileSheet=none");

  // Opening a preset must wipe the dangling section selection.
  await probe.getByRole("button", { name: "select preset", exact: true }).click();
  await expect(state).toHaveText("selected=preset_ct_probe section=none mobileSheet=none");
});

test("selectPresetFromList selects AND closes the mobile LIST sheet", async ({ mount }) => {
  const probe = await mount(<PresetSelectionProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "open list sheet" }).click();
  await expect(state).toContainText("mobileSheet=list");

  await probe.getByRole("button", { name: "select preset from list" }).click();
  await expect(state).toHaveText("selected=preset_ct_probe section=none mobileSheet=none");
});

test("dismissPresetSection clears the section AND closes the mobile CONTEXT sheet", async ({
  mount,
}) => {
  const probe = await mount(<PresetSelectionProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "select section", exact: true }).click();
  await probe.getByRole("button", { name: "open context sheet" }).click();
  await expect(state).toHaveText("selected=none section=sec_probe mobileSheet=context");

  await probe.getByRole("button", { name: "dismiss section" }).click();
  await expect(state).toHaveText("selected=none section=none mobileSheet=none");
});
