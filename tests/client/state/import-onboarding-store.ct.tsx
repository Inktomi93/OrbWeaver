// import-onboarding store CT — drives the persisted dismiss latch through its module action and asserts
// the read hook reflects the transition. A CT (not a plain unit test) because the store's only read
// surface is the reactive `useImportOnboardingDismissed` hook (useSyncExternalStore needs a real browser
// render — the character-selection-store.ct.tsx posture). localStorage is cleared before each test so the
// device-local persist can't leak the dismissed latch across cases.

import { expect, test } from "@playwright/experimental-ct-react";
import { ImportOnboardingProbe } from "./_ct-stories";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      globalThis.localStorage?.removeItem("orb:import-onboarding");
    } catch {
      // no storage in this context — nothing to clear
    }
  });
});

test("a fresh device starts undismissed; dismiss flips the latch", async ({ mount }) => {
  const probe = await mount(<ImportOnboardingProbe />);
  const state = probe.locator("output");
  await expect(state).toHaveText("dismissed=false");

  await probe.getByRole("button", { name: "dismiss card" }).click();
  await expect(state).toHaveText("dismissed=true");
});
