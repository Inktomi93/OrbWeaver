// CT: the Variables-tab Add-flow off-by-one regression (BUILD-SPEC §8 P0 1a). Adding a variable, naming
// it, and hitting Done must leave EXACTLY ONE row carrying the typed name — no phantom duplicate. Before
// the fix the new index was read AFTER the synchronous push (one PAST the item), so the editor wrote at an
// out-of-bounds index and the pushed default ("new_variable") stayed as a second, unedited row.
//
// The editor Dialog + its Done button portal to document.body (outside the mounted component root), so the
// dialog interactions use `page`, not the component-scoped `mount` handle.

import { expect, test } from "@playwright/experimental-ct-react";
import { VariablesTabStory } from "./_add-flow-stories";

test("Variables: Add → name → Done leaves one row, no phantom default", async ({ mount, page }) => {
  const probe = await mount(<VariablesTabStory />);

  await probe.getByRole("button", { name: "Add variable" }).click();
  await page.getByLabel("Name", { exact: true }).fill("MyVar");
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.getByText("MyVar")).toBeVisible();
  // The pushed default must have been the row we edited — not a leftover phantom.
  await expect(page.getByText("new_variable")).toHaveCount(0);
});
