// CT: a route that fails to load or render must land on an error with a retry, never a permanent logo splash,
// and a section read that suspends must hold only its own shell region.

import { SIGNED_IN_OWNER_ME, stubAuthMe } from "@orb/testkit/browser/stub-auth-me.ts";
import { expect, test } from "@playwright/experimental-ct-react";
import { ProductionRouterCrashReportStory, ProductionRouterStory, RegionSuspenseStory } from "./_ct-stories.tsx";

test("a failed authed-app chunk shows a retry, not the pending splash, and Retry reloads the page", async ({ mount, page }) => {
  let chunkRequests = 0;
  await stubAuthMe(page, SIGNED_IN_OWNER_ME);
  // A chunk that evaluates to a throw rejects the dynamic import with a plain Error; an aborted request would be a
  // module-not-found error, which TanStack answers with a one-shot page reload instead.
  await page.route(/authed-app/, (route) => {
    chunkRequests += 1;
    return route.fulfill({ status: 200, contentType: "text/javascript", body: 'throw new Error("chunk exploded");' });
  });
  await page.evaluate(() => globalThis.history.replaceState(null, "", "/"));
  await mount(<ProductionRouterStory />);

  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  expect(chunkRequests).toBe(1);

  // The browser caches a failed module fetch per document, so Retry is a reload; the CT mount does not survive
  // one, which is why the re-request itself cannot be observed here.
  await Promise.all([page.waitForEvent("framenavigated"), retry.click()]);
});

test("a route render crash reports once and lands on the retry surface", async ({ mount, page }) => {
  await stubAuthMe(page, SIGNED_IN_OWNER_ME);
  await page.route(/authed-app/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: 'export function AuthedApp() { throw new Error("route render crashed"); }',
    }),
  );
  await page.evaluate(() => globalThis.history.replaceState(null, "", "/"));
  await mount(<ProductionRouterCrashReportStory />);

  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Reflect.get(globalThis, "__ctRouteCrashes"))).toEqual(["route render crashed"]);
});

test("a shell region whose body suspends holds the suspension instead of replacing the shell", async ({ mount, page }) => {
  await mount(<RegionSuspenseStory />);
  const outside = page.getByText("shell outside the region");
  await expect(outside).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);

  await page.getByRole("button", { name: "Release list", exact: true }).click();
  await expect(page.getByText("list settled")).toBeVisible();
  await expect(outside).toBeVisible();
});
