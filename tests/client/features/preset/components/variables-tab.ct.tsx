// CT: the Variables-tab Add-flow off-by-one (BUILD-SPEC §8 P0 1a) AND the §7 AUTOSAVE array-trap. Adding a
// variable, naming it, and hitting Done must leave EXACTLY ONE row carrying the typed name — no phantom
// duplicate — AND the add must PERSIST (structural `pushFieldValue` doesn't fire the autosave listener, so
// the tab flushes explicitly). Remove must persist the same way. The `<output>` mirrors the last-saved
// array length + save count from the story's autosave spy.
//
// The editor Dialog + its Done button portal to document.body (outside the mounted component root), so the
// dialog interactions use `page`, not the component-scoped `mount` handle.

import { expect, test } from "@playwright/experimental-ct-react";
import { VariablesTabStory } from "./_add-flow-stories";

test("Variables: Add persists one row (no phantom), Remove persists the empty list", async ({ mount, page }) => {
  const probe = await mount(<VariablesTabStory />);
  const spy = probe.locator("output");

  await probe.getByRole("button", { name: "Add variable" }).click();
  await page.getByLabel("Name", { exact: true }).fill("MyVar");
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.getByText("MyVar")).toBeVisible();
  // The pushed default must have been the row we edited — not a leftover phantom.
  await expect(page.getByText("new_variable")).toHaveCount(0);
  // §7 TRAP: the add flush must have PERSISTED one variable (savedLen=1), not silently dropped it.
  await expect(spy).toContainText("savedLen=1");

  await probe.getByRole("button", { name: "Remove" }).click();
  // The remove flush persists the now-empty list — proving both structural paths reach `save`.
  await expect(spy).toContainText("savedLen=0");
});
