// CT: the world-info collection's ROWS over the stubbed network. Drives the production read
// (`worldInfo.listBooksWithUsage`) and pins what a roster row SAYS — the thing that makes a reader able to
// pick a book without opening it:
//   · the SCENT subtitle ("42 entries · attached ×3"), including the singular and the `unattached` word;
//   · the passive Global marker on the globally-attached book, and only on it;
//   · the kebab-only action grammar, with EXPORT as the ruled row arm (D121-D `kebab=Export`);
//   · the host's `filter`, applied by the owner's own rows.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { WorldInfoCollectionRowsStory } from "../_ct-stories.tsx";

/** Any row STATE-TOGGLE name (§12's toggle arm) — world-info deliberately has none. */
const ANY_STAR_TOGGLE = /^(Star|Unstar) /;

const REACH = {
  id: "world_book_reach000001",
  name: "The Ninefold Reach",
  description: "the big one",
  createdAt: 3,
  entryCount: 42,
  usage: { characters: 2, personas: 0, chats: 0, global: true, total: 3 },
};
const SCRATCH = {
  id: "world_book_scratch0001",
  name: "Scratch lore",
  description: null,
  createdAt: 2,
  entryCount: 1,
  usage: { characters: 0, personas: 0, chats: 0, global: false, total: 0 },
};

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "worldInfo.listBooksWithUsage": () => [REACH, SCRATCH],
    "worldInfo.exportBook": () => ({ filename: "the-ninefold-reach.json", fileText: "{}" }),
  });
}

test("each row states its SCENT — entry count and attachment total, singular and unattached included", async ({ mount, page }) => {
  await stub(page);
  const rows = await mount(<WorldInfoCollectionRowsStory />);

  await expect(rows.getByText("The Ninefold Reach")).toBeVisible();
  await expect(rows.getByText("42 entries · attached ×3")).toBeVisible();
  // A book that fires nowhere says the WORD, not "attached ×0"; one entry is singular.
  await expect(rows.getByText("1 entry · unattached")).toBeVisible();
});

test("the globally-attached book carries the passive Global marker — and only it", async ({ mount, page }) => {
  await stub(page);
  const rows = await mount(<WorldInfoCollectionRowsStory />);

  await expect(rows.getByText("Scratch lore")).toBeVisible();
  await expect(rows.getByText("Global")).toHaveCount(1);
});

test("rows stay kebab-only, and EXPORT is the row's ruled arm", async ({ mount, page }) => {
  const trpc = await stub(page);
  const rows = await mount(<WorldInfoCollectionRowsStory />);
  await expect(rows.getByText("The Ninefold Reach")).toBeVisible();

  // No inline verb, no state toggle — everything the row can do lives behind the one ⋯ menu.
  await expect(rows.getByRole("button", { name: "Duplicate The Ninefold Reach", exact: true })).toHaveCount(0);
  await expect(rows.getByRole("button", { name: ANY_STAR_TOGGLE })).toHaveCount(0);

  // §12.2: the kebab rests hidden + inert like every row affordance, so reach it by hovering the row.
  await rows.locator('[data-slot="list-row-root"]', { hasText: "The Ninefold Reach" }).hover();
  await rows.getByRole("button", { name: "Actions for The Ninefold Reach", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Export" }).click();
  await expect.poll(() => trpc.count("worldInfo.exportBook"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
});

test("the host's filter is applied by the owner's rows", async ({ mount, page }) => {
  await stub(page);
  const rows = await mount(<WorldInfoCollectionRowsStory filter="scratch" />);

  await expect(rows.getByText("Scratch lore")).toBeVisible();
  await expect(rows.getByText("The Ninefold Reach")).toHaveCount(0);
});
