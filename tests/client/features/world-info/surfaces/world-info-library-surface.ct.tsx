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
