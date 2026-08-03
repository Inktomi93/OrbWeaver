// createCollectionSurface CT — the sliding-window infinite list machine (UI-Lib-TanStack-Query.md
// §4/§F) exercised against a REAL `trpc.notifications.list.infiniteQueryOptions(...)` call (the
// only router procedure shaped for cursor pagination — a hand-mock queryFn would hide the exact
// key-type mismatch the TKey/TError fix (data/create-collection-surface.ts header) pins). Two
// properties: the tail-fetch guard (`hasNextPage && !isFetching`) actually calls `fetchNextPage`
// and appends the next page, and it stays a no-op once the collection is exhausted.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../support/ct/route-trpc.ts";
import { NotificationsSurfaceStory } from "./_ct-stories.tsx";

const PAGE_1 = {
  items: [
    { id: "notif_1", type: "invite", createdAt: 1 },
    { id: "notif_2", type: "kicked", createdAt: 2 },
  ],
  nextCursor: 2,
};
const PAGE_2 = {
  items: [{ id: "notif_3", type: "handoff-nominated", createdAt: 3 }],
  nextCursor: null,
};

test("onEndApproach fetches the next page and appends its rows (the guarded tail-fetch)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "notifications.list": (input: unknown) => {
      const cursor = (input as { cursor?: number } | undefined)?.cursor;
      return cursor === undefined ? PAGE_1 : PAGE_2;
    },
  });

  await mount(<NotificationsSurfaceStory />);

  await expect(page.locator("li")).toHaveCount(2);
  await expect(page.getByTestId("surface-state")).toContainText("hasNext=true");
  await expect.poll(() => trpc.count("notifications.list")).toBe(1);

  await page.getByRole("button", { name: "approach-end" }).click();

  await expect(page.locator("li")).toHaveCount(3);
  await expect(page.getByTestId("surface-state")).toContainText("hasNext=false");
  await expect.poll(() => trpc.count("notifications.list")).toBe(2);
});

test("once exhausted (hasNextPage:false), repeated onEndApproach calls stay a no-op", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "notifications.list": () => PAGE_2, // a single, already-final page — hasNextPage starts false.
  });

  await mount(<NotificationsSurfaceStory />);

  await expect(page.locator("li")).toHaveCount(1);
  await expect(page.getByTestId("surface-state")).toContainText("hasNext=false");

  const button = page.getByRole("button", { name: "approach-end" });
  await button.click();
  await button.click();

  // The guard (`hasNextPage && !isFetching`) never fires past the end — one initial call only.
  await expect.poll(() => trpc.count("notifications.list")).toBe(1);
});
