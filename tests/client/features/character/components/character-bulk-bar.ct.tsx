// CT: `<CharacterBulkBar>` at a NARROW LIST panel (P1 regression — the trailing Delete button was clipped
// past the ~337px panel edge). Asserts all three bulk actions render AND the last one (Delete) fits fully
// inside the panel width (its right edge ≤ the panel's), which `size="sm"` restores.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc.ts";
import { CharacterBulkBarStory } from "../_ct-stories.tsx";

test("the bulk actions fit the narrow panel — Delete is not clipped past the edge", async ({ mount, page }) => {
  const component = await mount(<CharacterBulkBarStory />);
  const del = component.getByRole("button", { name: "Delete", exact: true });
  await expect(component.getByRole("button", { name: "Tag", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Archive", exact: true })).toBeVisible();
  await expect(del).toBeVisible();

  // The Delete button's right edge stays within the panel box (no clip past the ~337px edge). Null boxes
  // (an unmeasurable/hidden element) resolve to a failing comparison rather than a skipped assertion.
  const panelBox = await page.getByTestId("bulk-panel").boundingBox();
  const delBox = await del.boundingBox();
  const panelRight = (panelBox?.x ?? 0) + (panelBox?.width ?? 0);
  const delRight = (delBox?.x ?? Number.POSITIVE_INFINITY) + (delBox?.width ?? 0);
  expect(delRight).toBeLessThanOrEqual(panelRight);
});

test("bulk selection clears only after the durable archive succeeds and remains for retry on rejection", async ({ mount, page }) => {
  let attempts = 0;
  const trpc = await routeTrpc(page, {
    "character.bulkArchive": () => {
      attempts += 1;
      return attempts === 1 ? trpcError() : { archived: 3 };
    },
  });
  const component = await mount(<CharacterBulkBarStory />);
  const count = component.getByRole("status", { name: "Bulk selection count" });
  const archive = component.getByRole("button", { name: "Archive", exact: true });

  await expect(count).toHaveText("3");
  await archive.click();
  await expect.poll(() => trpc.count("character.bulkArchive")).toBe(1);
  await expect(archive).toBeEnabled();
  await expect(count).toHaveText("3");

  await archive.click();
  await expect(count).toHaveText("0");
  await expect.poll(() => trpc.count("character.bulkArchive")).toBe(2);
});
