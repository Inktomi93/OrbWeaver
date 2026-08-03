// character-selection store CT — drives the hook-backed store through its module actions and asserts the
// read hooks reflect each transition (J9: LIST selection drives the Characters CONTENT detail card; the
// facet drill-in reveals the CONTEXT Field inspector). A CT (not a plain unit test) because the store's
// only read surface is the reactive `useSelectedCharacterId` hook — useSyncExternalStore needs a real
// browser render (the shell-store.ct.tsx posture; no non-reactive snapshot escape hatch exists, and adding
// one would be API surface no consumer needs).

import { expect, test } from "@playwright/experimental-ct-react";
import { CharacterSelectionProbe } from "./_ct-stories.tsx";

test("select sets the id; clear resets to none", async ({ mount }) => {
  const probe = await mount(<CharacterSelectionProbe />);
  const state = probe.locator("output");
  // Fresh page → nothing selected (the Characters CONTENT shows the welcome state).
  await expect(state).toHaveText("selected=none facet=none");

  await probe.getByRole("button", { name: "select aria" }).click();
  await expect(state).toHaveText("selected=char_probe_aria facet=none");

  await probe.getByRole("button", { name: "clear selection" }).click();
  await expect(state).toHaveText("selected=none facet=none");
});

test("selecting a character clears a stale facet (no carry across characters)", async ({ mount }) => {
  const probe = await mount(<CharacterSelectionProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "select facet" }).click();
  await expect(state).toHaveText("selected=none facet=facet_probe");

  // Selecting a character must wipe the dangling facet selection (mirrors selectPreset/selectWorldBook).
  await probe.getByRole("button", { name: "select aria" }).click();
  await expect(state).toHaveText("selected=char_probe_aria facet=none");
});

test("clear facet leaves the character selection untouched", async ({ mount }) => {
  const probe = await mount(<CharacterSelectionProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "select aria" }).click();
  await probe.getByRole("button", { name: "select facet" }).click();
  await expect(state).toHaveText("selected=char_probe_aria facet=facet_probe");

  await probe.getByRole("button", { name: "clear facet" }).click();
  await expect(state).toHaveText("selected=char_probe_aria facet=none");
});
