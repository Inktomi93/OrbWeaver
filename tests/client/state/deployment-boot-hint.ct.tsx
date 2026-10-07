// THE DEPLOYMENT BOOT HINT (#476) — this device's remembered answer to `/api/auth/config.multiHumanCapable`,
// readable at first paint instead of ~90ms–4.7s into the boot.
//
// It is a CT rather than a unit test for the same reason its appearance sibling is: the claim is about a
// BOOT. A persisted store rehydrates off localStorage at MODULE INIT, so the blob is seeded with
// `addInitScript` + a reload and the probe's FIRST render is the evidence — writing localStorage after mount
// would prove nothing. (The rendered consequence, the topbar bell that no longer shifts in, is pinned one
// tier up at tests/client/features/notifications/lib/notifications-chrome.ct.tsx.)

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { DeploymentBootHintProbe } from "./_ct-stories.tsx";

/** The store's own key (`createPersistedStore("deployment-boot")`) on a browser with no identity bound. */
const HINT_KEY = "orb:deployment-boot";

/** Seed this device's remembered answer BEFORE the page's modules run, then boot into it. */
async function seed(page: Page, state: Record<string, unknown>): Promise<void> {
  const blob = JSON.stringify({ state, version: 1 });
  await page.addInitScript({
    content: `try { localStorage.setItem(${JSON.stringify(HINT_KEY)}, ${JSON.stringify(blob)}); } catch { /* storage disabled */ }`,
  });
  await page.reload();
}

test("a device that remembers a MULTI-HUMAN deployment answers TRUE on its first render", async ({ mount, page }) => {
  expect("localStorage" in globalThis).toBe(false);
  expect("sessionStorage" in globalThis).toBe(false);
  await seed(page, { multiHumanCapable: true });

  const probe = await mount(<DeploymentBootHintProbe />);
  await expect(probe.locator("output")).toHaveText("multiHuman=true");
});

test("a device that remembers a SINGLE-HUMAN deployment answers FALSE — the hint carries both arms", async ({ mount, page }) => {
  await seed(page, { multiHumanCapable: false });

  const probe = await mount(<DeploymentBootHintProbe />);
  await expect(probe.locator("output")).toHaveText("multiHuman=false");
});

test("a FRESH device answers UNKNOWN — an absent hint is not an answer, and the caller's floor decides", async ({ mount }) => {
  const probe = await mount(<DeploymentBootHintProbe />);
  await expect(probe.locator("output")).toHaveText("multiHuman=unknown");
});

test("a CORRUPT blob heals to UNKNOWN rather than asserting a capability nobody served", async ({ mount, page }) => {
  // A persisted blob is untrusted input: the string "true" is the shape a hand-edit or an older codec
  // produces, and it must NOT be read as the boolean. `migrate` is TOTAL, so it degrades to "never told".
  await seed(page, { multiHumanCapable: "true" });

  const probe = await mount(<DeploymentBootHintProbe />);
  await expect(probe.locator("output")).toHaveText("multiHuman=unknown");
});

// The WRITE side: `rememberMultiHumanCapable` is called from `useMultiHumanCapable` (data/auth-config.ts) the
// moment `/api/auth/config` resolves, i.e. only ever with an AUTHORITATIVE value — the server always wins,
// and what it says is what the next boot reads.
test("the server's answer is what the device remembers — including a flip back to single-human", async ({ mount, page }) => {
  const probe = await mount(<DeploymentBootHintProbe />);
  const state = probe.locator("output");
  await expect(state).toHaveText("multiHuman=unknown");

  await probe.getByRole("button", { name: "server says capable" }).click();
  await expect(state).toHaveText("multiHuman=true");
  await expect.poll(() => page.evaluate((k: string) => localStorage.getItem(k), HINT_KEY)).toContain('"multiHumanCapable":true');

  // A deployment that STOPPED being multi-human is remembered as such — a stale yes cannot outlive its answer.
  await probe.getByRole("button", { name: "server says single-human" }).click();
  await expect(state).toHaveText("multiHuman=false");
  await expect.poll(() => page.evaluate((k: string) => localStorage.getItem(k), HINT_KEY)).toContain('"multiHumanCapable":false');

  await probe.getByRole("button", { name: "forget device" }).click();
  await expect(state).toHaveText("multiHuman=unknown");
});
