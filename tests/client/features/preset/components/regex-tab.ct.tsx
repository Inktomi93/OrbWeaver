// CT: the Regex-tab Add-flow off-by-one regression (BUILD-SPEC §8 P0 1a). Adding a script, naming it, and
// hitting Done must leave EXACTLY ONE row carrying the typed name — no phantom duplicate. Before the fix
// the new index was read AFTER the synchronous push (one PAST the item), so the editor wrote at an
// out-of-bounds index and the pushed default ("New script") stayed as a second, unedited row.
//
// The editor Dialog + its Done button portal to document.body (outside the mounted component root), so the
// dialog interactions use `page`, not the component-scoped `mount` handle.

import { expect, test } from "@playwright/experimental-ct-react";
import { RegexTabStory } from "./_add-flow-stories";

test("Regex: Add → name → Done leaves one row, no phantom default", async ({ mount, page }) => {
  const probe = await mount(<RegexTabStory />);

  await probe.getByRole("button", { name: "Add script" }).click();
  await page.getByLabel("Name", { exact: true }).fill("MyScript");
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.getByText("MyScript")).toBeVisible();
  await expect(page.getByText("New script")).toHaveCount(0);
});
