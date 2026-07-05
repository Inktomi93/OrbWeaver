// character-selection store CT — drives the hook-backed store through its module actions and asserts the
// read hook reflects each transition (J9: LIST selection drives the Characters CONTENT detail card). A CT
// (not a plain unit test) because the store's only read surface is the reactive `useSelectedCharacterId`
// hook — useSyncExternalStore needs a real browser render (the shell-store.ct.tsx posture; no non-reactive
// snapshot escape hatch exists, and adding one would be API surface no consumer needs).

import { expect, test } from "@playwright/experimental-ct-react";
import { CharacterSelectionProbe } from "./_ct-stories";

test("select sets the id; clear resets to none", async ({ mount }) => {
  const probe = await mount(<CharacterSelectionProbe />);
  const state = probe.locator("output");
  // Fresh page → nothing selected (the Characters CONTENT shows the welcome state).
  await expect(state).toHaveText("selected=none");

  await probe.getByRole("button", { name: "select aria" }).click();
  await expect(state).toHaveText("selected=char_probe_aria");

  await probe.getByRole("button", { name: "clear selection" }).click();
  await expect(state).toHaveText("selected=none");
});
