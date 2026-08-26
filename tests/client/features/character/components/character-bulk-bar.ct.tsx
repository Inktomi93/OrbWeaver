// CT: `<CharacterBulkBar>` at a NARROW LIST panel (P1 regression — the trailing Delete button was clipped
// past the ~337px panel edge). Asserts all three bulk actions render AND the last one (Delete) fits fully
// inside the panel width (its right edge ≤ the panel's), which `size="sm"` restores.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/ct/route-trpc.ts";
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

async function replaceSelectionWhileHeld(component: Locator): Promise<void> {
  await component.getByTestId("replace-selection-clear").click();
  await component.getByRole("button", { name: "Select newer character" }).click();
  await expect(component.getByRole("status", { name: "Bulk selected IDs" })).toHaveText("char_d");
}

test("a held Archive completion preserves a newer selection", async ({ mount, page }) => {
  const held = trpcHold();
  await routeTrpc(page, { "character.bulkArchive": held });
  const component = await mount(<CharacterBulkBarStory />);

  await component.getByRole("button", { name: "Archive", exact: true }).click();
  await held.requested;
  await replaceSelectionWhileHeld(component);
  held.release({ archived: 3 });

  await expect(component.getByRole("status", { name: "Bulk selected IDs" })).toHaveText("char_d");
});

test("a held Tag completion preserves a newer selection", async ({ mount, page }) => {
  const held = trpcHold();
  await routeTrpc(page, { "tag.listTagsWithUsage": [], "character.bulkAddCardTag": held });
  const component = await mount(<CharacterBulkBarStory />);

  await component.getByRole("button", { name: "Tag", exact: true }).click();
  await expect(page.getByText("No tags yet — the name you type becomes your first one.")).toBeVisible();
  await page.getByRole("combobox", { name: "Tag name" }).fill("adventure");
  await page.getByRole("button", { name: 'Create "adventure"' }).click();
  await held.requested;
  await replaceSelectionWhileHeld(component);
  held.release({ tagged: 3 });

  await expect(component.getByRole("status", { name: "Bulk selected IDs" })).toHaveText("char_d");
});

test("a held Delete completion preserves a newer selection", async ({ mount, page }) => {
  const held = trpcHold();
  await routeTrpc(page, { "character.bulkRemove": held });
  const component = await mount(<CharacterBulkBarStory />);

  await component.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await held.requested;
  await replaceSelectionWhileHeld(component);
  held.release({ removed: 3 });

  await expect(component.getByRole("status", { name: "Bulk selected IDs" })).toHaveText("char_d");
});
