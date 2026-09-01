// The APPEARANCE BOOT HINT (#188 N-1 for reduced motion, #231 for font scale · density · theme) — this
// device's remembered answers to the synced appearance axes, replayed onto <html> before anything paints.
//
// It is a CT rather than a unit test because the claim IS the document: the store's value is only half of
// it, and the half that silences the boot veil / sizes the shell / paints the right palette is the root
// state itself. The blob is seeded with `addInitScript` + a reload, because a persisted store rehydrates
// at MODULE INIT — writing localStorage after mount would prove nothing about a boot.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { isSeedThemeName } from "../../../packages/client/src/state/appearance-boot-hint.ts";
import { AppearanceBootHintProbe } from "./_ct-stories.tsx";

/** The store's own key (`createPersistedStore("appearance-boot")`) on a browser with no identity bound. */
const HINT_KEY = "orb:appearance-boot";

function blob(state: Record<string, unknown>): string {
  return JSON.stringify({ state, version: 1 });
}

/** Seed the device's remembered answers BEFORE the page's modules run, then boot into them. */
async function seed(page: Page, state: Record<string, unknown>): Promise<void> {
  await page.addInitScript({
    content: `try { localStorage.setItem(${JSON.stringify(HINT_KEY)}, ${JSON.stringify(blob(state))}); } catch { /* storage disabled */ }`,
  });
  await page.reload();
}

test("only generated seed palettes are accepted as boot theme names", () => {
  expect(isSeedThemeName("light")).toBe(true);
  expect(isSeedThemeName("mocha")).toBe(true);
  expect(isSeedThemeName("hearth")).toBe(false);
  expect(isSeedThemeName("not-a-palette")).toBe(false);
});

test("a device that remembers a LOUD appearance stamps motion, scale and theme before anything renders", async ({ mount, page }) => {
  await seed(page, { reducedMotion: true, fontScale: 1.25, density: "compact", dataTheme: "light" });

  const probe = await mount(<AppearanceBootHintProbe />);
  await expect(probe.locator("output")).toHaveText("hint motion=true scale=1.25 density=compact theme=light | stamped motion=true scale=1.25 theme=light");
});

test("a FRESH device stamps NOTHING — an absent hint is not a preference, and today's floors still decide", async ({ mount }) => {
  const probe = await mount(<AppearanceBootHintProbe />);
  await expect(probe.locator("output")).toHaveText(
    "hint motion=false scale=1 density=comfortable theme=none | stamped motion=absent scale=absent theme=absent",
  );
});

// The WRITE side: the `remember*` seams are called from `useAppearance`/`useSelectedTheme` the moment their
// reads resolve, i.e. only ever with AUTHORITATIVE values — the server always wins, and what it says is
// what the next boot replays.
test("the server's answer is what the device remembers — and what the next boot's replay stamps", async ({ mount }) => {
  const probe = await mount(<AppearanceBootHintProbe />);
  const state = probe.locator("output");
  await expect(state).toHaveText("hint motion=false scale=1 density=comfortable theme=none | stamped motion=absent scale=absent theme=absent");

  await probe.getByRole("button", { name: "server says loud" }).click();
  // The probe replays on every render (a boot does it once, before React), so the stamps land here too.
  await expect(state).toHaveText("hint motion=true scale=1.25 density=compact theme=none | stamped motion=true scale=1.25 theme=absent");

  await probe.getByRole("button", { name: "server says light" }).click();
  await expect(state).toHaveText("hint motion=true scale=1.25 density=compact theme=light | stamped motion=true scale=1.25 theme=light");

  // Back to the shipped defaults: the REPLAY stops asserting anything, because a default is not a
  // preference. The already-stamped attributes are the shell's own to clear (its root effect writes the
  // resolved value); forgetting is not un-stamping.
  await probe.getByRole("button", { name: "server says default" }).click();
  await expect(state).toHaveText("hint motion=false scale=1 density=comfortable theme=light | stamped motion=true scale=1.25 theme=light");
});

test("a CORRUPT blob heals to the shipped floors rather than asserting a preference nobody expressed", async ({ mount, page }) => {
  // Every axis wrong in a different way: wrong type, out of the contract's bounds, off the enum, and a
  // theme name no generated [data-theme] block exists for.
  await seed(page, { reducedMotion: "yes", fontScale: 99, density: "roomy", dataTheme: "not-a-palette" });

  const probe = await mount(<AppearanceBootHintProbe />);
  await expect(probe.locator("output")).toHaveText(
    "hint motion=false scale=1 density=comfortable theme=none | stamped motion=absent scale=absent theme=absent",
  );
});
