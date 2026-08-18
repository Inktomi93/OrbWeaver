// The REDUCED-MOTION BOOT HINT (#188 N-1) — this device's remembered answer to the synced
// `appearance.reducedMotion` pref, replayed onto <html> before anything animates.
//
// It is a CT rather than a unit test because the claim IS the document: the store's value is only half of
// it, and the half that silences the boot veil is the root attribute the `[data-reduced-motion="true"] *`
// floor selects on. The blob is seeded with `addInitScript` + a reload, because a persisted store
// rehydrates at MODULE INIT — writing localStorage after mount would prove nothing about a boot.

import { expect, test } from "@playwright/experimental-ct-react";
import { ReducedMotionHintProbe } from "./_ct-stories.tsx";

/** The store's own key (`createPersistedStore("reduced-motion")`) on a browser with no identity bound. */
const HINT_KEY = "orb:reduced-motion";
const HINT_ON = JSON.stringify({ state: { reducedMotion: true }, version: 1 });

test("a device that remembers reducedMotion=ON stamps the root flag before anything renders", async ({ mount, page }) => {
  await page.addInitScript({
    content: `try { localStorage.setItem(${JSON.stringify(HINT_KEY)}, ${JSON.stringify(HINT_ON)}); } catch { /* storage disabled */ }`,
  });
  await page.reload();

  const probe = await mount(<ReducedMotionHintProbe />);
  await expect(probe.locator("output")).toHaveText("hint=true attr=true");
});

test("a FRESH device stamps NOTHING — an absent hint is not a preference, and the OS query still decides", async ({ mount }) => {
  const probe = await mount(<ReducedMotionHintProbe />);
  await expect(probe.locator("output")).toHaveText("hint=false attr=absent");
});

// The WRITE side: `rememberReducedMotionHint` is called from `useAppearance` the moment the settings read
// resolves, i.e. only ever with an AUTHORITATIVE value — the server always wins, and what it says is what
// the next boot replays.
test("the server's answer is what the device remembers — and what the next boot's replay stamps", async ({ mount }) => {
  const probe = await mount(<ReducedMotionHintProbe />);
  const state = probe.locator("output");
  await expect(state).toHaveText("hint=false attr=absent");

  await probe.getByRole("button", { name: "server says on" }).click();
  // The probe replays on every render (a boot does it once, before React), so the flag lands here too.
  await expect(state).toHaveText("hint=true attr=true");

  await probe.getByRole("button", { name: "server says off" }).click();
  // The replay only ever stamps the ON arm: forgetting is not un-stamping. The OFF arm belongs to the
  // shell's own root effect, which writes the literal "false" once the read has landed.
  await expect(state).toHaveText("hint=false attr=true");

  await probe.getByRole("button", { name: "forget device" }).click();
  await expect(state).toHaveText("hint=false attr=true");
});

test("a CORRUPT blob heals to unstamped rather than asserting a preference nobody expressed", async ({ mount, page }) => {
  await page.addInitScript({
    content: `try { localStorage.setItem(${JSON.stringify(HINT_KEY)}, ${JSON.stringify(JSON.stringify({ state: { reducedMotion: "yes" }, version: 1 }))}); } catch { /* storage disabled */ }`,
  });
  await page.reload();

  const probe = await mount(<ReducedMotionHintProbe />);
  await expect(probe.locator("output")).toHaveText("hint=false attr=absent");
});
