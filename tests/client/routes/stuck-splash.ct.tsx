// CT: a failed lazy `/` chunk must land on an error with a retry, never a permanent logo splash.

import { expect, test } from "@playwright/experimental-ct-react";
import { ProductionRouterStory } from "./_ct-stories.tsx";

test("a failed authed-app chunk shows a retry that re-requests the chunk, not the pending splash", async ({ mount, page }) => {
  let chunkRequests = 0;
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, json: { authenticated: true, handle: "owner", role: "owner" } }));
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

  // The browser caches a failed module fetch per document, so retry is a reload that requests the chunk afresh.
  await Promise.all([page.waitForEvent("framenavigated"), retry.click()]);
});
