// The router's pending mark is a visible, named status, never a blank page.
import { expect, test } from "@playwright/test";
import { ROUTE_PENDING_NAME } from "#client/routes/route-pending-names.ts";
import type { RoutePendingStory } from "./_route-pending-stories.tsx";

test("the pending mark is a visible status named Loading", async ({ mount, page }) => {
  await mount<typeof RoutePendingStory>("tests/client/routes/_route-pending-stories/RoutePendingStory", {});
  await expect(page.getByRole("status", { name: ROUTE_PENDING_NAME, exact: true })).toBeVisible();
});
