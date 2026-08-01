// CT: the World Info LIST surface over the stubbed network. Drives the production path: `worldInfo.listBooks`
// (the library read) + `worldInfo.listGlobal` (the "Global" badge source). Asserts the rows render, the
// globally-attached book carries its passive "Global" marker, and the header "New" fires `worldInfo.createBook`.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { WorldInfoLibrarySurfaceStory } from "../_ct-stories";

const ALPHA = {
  id: "world_book_alpha00001",
  name: "Alpha",
  description: "first book",
  createdAt: 1,
};
const BETA = { id: "world_book_beta000001", name: "Beta", description: null, createdAt: 2 };
/** Any row STATE-TOGGLE name (§12's toggle arm) — world-info deliberately has none. */
const ANY_STAR_TOGGLE = /^(Star|Unstar) /;

test("L4 the LIST band names the section + counts the books (the in-pane title is retired)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "worldInfo.listBooks": () => [ALPHA, BETA],
    "worldInfo.listGlobal": () => [],
  });

  await mount(<WorldInfoLibrarySurfaceStory />);

  const band = page.getByTestId("list-band");
  await expect(band.getByRole("heading", { level: 2 })).toHaveText("World Info");
  await expect(band.getByText("2", { exact: true })).toBeVisible();
  // The title now exists EXACTLY once — in the band, not doubled by an in-pane header.
  await expect(page.getByRole("heading", { name: "World Info" })).toHaveCount(1);
});

test("lists books, marks the global one, and New fires createBook", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "worldInfo.listBooks": () => [ALPHA, BETA],
    // Alpha is attached globally (role null on the global scope).
    "worldInfo.listGlobal": () => [{ ...ALPHA, role: null }],
    "worldInfo.createBook": () => ({
      id: "world_book_new0000001",
      name: "New book",
      description: null,
      createdAt: 3,
    }),
  });

  await mount(<WorldInfoLibrarySurfaceStory />);

  await expect(page.getByText("Alpha")).toBeVisible();
  await expect(page.getByText("Beta")).toBeVisible();
  // The global book carries the passive "Global" marker; the non-global one does not.
  await expect(page.getByText("Global")).toHaveCount(1);

  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect.poll(() => trpc.count("worldInfo.createBook"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
});

// §12 per-list assignment (list-pane-projection): books are low-churn with no boolean row state and no
// frequency evidence for any verb, so world-info is the deliberate KEBAB-ONLY arm of the grammar — no
// inline toggle, no inline verb. Pinned so a later sweep can't quietly give every list the same cluster.
test("§12 world-info rows stay kebab-only — no inline toggle, no inline verb", async ({ mount, page }) => {
  await routeTrpc(page, {
    "worldInfo.listBooks": () => [ALPHA, BETA],
    "worldInfo.listGlobal": () => [],
  });

  await mount(<WorldInfoLibrarySurfaceStory />);
  await expect(page.getByText("Alpha")).toBeVisible();

  // Everything the row can do lives behind the one ⋯ menu.
  await expect(page.getByRole("button", { name: "Duplicate Alpha", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: ANY_STAR_TOGGLE })).toHaveCount(0);
  // §12.2: the kebab rests hidden + inert like every row affordance, so reach it by hovering the row.
  await page.locator('[data-slot="list-row-root"]', { hasText: "Alpha" }).hover();
  await page.getByRole("button", { name: "Actions for Alpha", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
});
