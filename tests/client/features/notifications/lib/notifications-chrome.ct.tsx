// CT: the notifications chrome entry's VISIBILITY gate (#476) — what the topbar trail paints in its FIRST
// frame, while `/api/auth/config` is still in flight.
//
// The defect this pins: the gate used to read `useAuthConfig().data?.multiHumanCapable === true`, which is
// FALSE for the whole flight of that fetch (~90ms–4.7s at app-root mount). On a multi-human deployment the
// trail therefore painted without the bell and the bell MOUNTED INTO it — `.shell-topbar-trail`
// 1169,8,99,32 → 1127,7,141,34, a 0.00015 layout shift on every boot, an order of magnitude under the
// `[cls]` flagger's own reporting floor. The fix is the appearance-boot-hint pattern applied to the
// capability: a device-local remembered answer, read synchronously at first paint.
//
// It is a CT, not a unit test, because the claim is about a RENDERED first frame with the config withheld —
// the hint's stored value is only half of it. The blob is seeded with `addInitScript` + a reload, because a
// persisted store rehydrates at MODULE INIT: writing localStorage after mount would prove nothing about a
// boot.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeOrbSocket } from "../../../../support/ct/route-orb-socket.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { NotificationsTrailStory } from "../_ct-stories.tsx";

/** The store's own key (`createPersistedStore("deployment-boot")`) on a browser with no identity bound. */
const HINT_KEY = "orb:deployment-boot";

/** Seed this device's remembered capability BEFORE the page's modules run, then boot into it. */
async function seedHint(page: Page, multiHumanCapable: boolean): Promise<void> {
  const blob = JSON.stringify({ state: { multiHumanCapable }, version: 1 });
  await page.addInitScript({
    content: `try { localStorage.setItem(${JSON.stringify(HINT_KEY)}, ${JSON.stringify(blob)}); } catch { /* storage disabled */ }`,
  });
  await page.reload();
}

/** This device's remembered answer as the browser actually holds it (null = never told / no blob). */
async function readHint(page: Page): Promise<boolean | null> {
  return await page.evaluate((key: string) => {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return null;
    }
    const parsed = JSON.parse(raw) as { state?: { multiHumanCapable?: boolean | null } };
    return parsed.state?.multiHumanCapable ?? null;
  }, HINT_KEY);
}

/** Hold `/api/auth/config` in flight; the returned fn lands the deployment's answer when the test wants it.
 *  This is the whole point of the fixture: the boot window under test is the one where it has NOT landed. */
async function routeAuthConfig(page: Page): Promise<(multiHumanCapable: boolean) => void> {
  let land: ((capable: boolean) => void) | undefined;
  const answered = new Promise<boolean>((resolve) => {
    land = resolve;
  });
  await page.route("**/api/auth/config", async (route) => {
    const multiHumanCapable = await answered;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "local", multiHumanCapable }) });
  });
  return (capable: boolean): void => land?.(capable);
}

/** The bell's own reads — an empty inbox, so its accessible name is the bare "Notifications". */
async function routeInbox(page: Page): Promise<void> {
  await routeTrpc(page, { "notifications.list": () => ({ items: [], nextCursor: null }), "notifications.markAllRead": () => ({ markedCount: 0 }) });
  await routeOrbSocket(page, { frames: [], awaitAttaches: 0 });
}

const BELL = { name: "Notifications", exact: true } as const;

test("a device that remembers a MULTI-HUMAN deployment paints the bell before the config lands", async ({ mount, page }) => {
  await routeInbox(page);
  const land = await routeAuthConfig(page);
  await seedHint(page, true);

  const trail = await mount(<NotificationsTrailStory />);

  // The config is STILL in flight — this is the frame that used to be bell-less and then shifted.
  await expect(trail.getByRole("button", BELL)).toBeVisible();
  land(true);
  // And it stays: the server agreeing changes nothing the user can see.
  await expect(trail.getByRole("button", BELL)).toBeVisible();
});

test("a FRESH device paints NOTHING until the config lands — an absent hint is not an answer", async ({ mount, page }) => {
  // A FENCE, not a defect proof: this is also the pre-#476 behavior. It pins the honest first-EVER-visit arm
  // so a future "just default it to true" cannot reserve a control single-human deployments never render.
  await routeInbox(page);
  const land = await routeAuthConfig(page);

  const trail = await mount(<NotificationsTrailStory />);

  await expect(trail.getByRole("button", BELL)).toHaveCount(0);
  land(true);
  // The server's yes is what puts it there — and what the device remembers for its next boot.
  await expect(trail.getByRole("button", BELL)).toBeVisible();
  await expect.poll(() => readHint(page)).toBe(true);
});

test("a capability FLIP is never masked: the config's NO un-draws the remembered bell and rewrites the hint", async ({ mount, page }) => {
  await routeInbox(page);
  const land = await routeAuthConfig(page);
  await seedHint(page, true);

  const trail = await mount(<NotificationsTrailStory />);
  await expect(trail.getByRole("button", BELL)).toBeVisible();

  // The deployment is no longer multi-human. The hint is a RENDER hint, so the server's answer wins the
  // instant it exists — both on screen and in this device's memory.
  land(false);
  await expect(trail.getByRole("button", BELL)).toHaveCount(0);
  await expect.poll(() => readHint(page)).toBe(false);
});

test("a stale NO does not stick either — the config's YES draws the bell and rewrites the hint", async ({ mount, page }) => {
  await routeInbox(page);
  const land = await routeAuthConfig(page);
  await seedHint(page, false);

  const trail = await mount(<NotificationsTrailStory />);
  await expect(trail.getByRole("button", BELL)).toHaveCount(0);

  land(true);
  await expect(trail.getByRole("button", BELL)).toBeVisible();
  await expect.poll(() => readHint(page)).toBe(true);
});
