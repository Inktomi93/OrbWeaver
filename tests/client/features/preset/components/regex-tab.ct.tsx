// CT: the Regex-tab Add-flow off-by-one (BUILD-SPEC §8 P0 1a) AND the §7 AUTOSAVE array-trap. Adding a
// script, naming it, and hitting Done must leave EXACTLY ONE row carrying the typed name — no phantom
// duplicate — AND the add must PERSIST (structural `pushFieldValue` doesn't fire the autosave listener, so
// the tab flushes explicitly). Remove persists the same way. The `<output>` mirrors the story's autosave spy.
//
// The editor Dialog + its Done button portal to document.body (outside the mounted component root), so the
// dialog interactions use `page`, not the component-scoped `mount` handle.

import { expect, test } from "@playwright/experimental-ct-react";
import { RegexTabStory } from "./_add-flow-stories";

test("Regex: Add persists one row (no phantom), Remove persists the empty list", async ({ mount, page }) => {
  const probe = await mount(<RegexTabStory />);
  const spy = probe.locator("output");

  await probe.getByRole("button", { name: "Add script" }).click();
  await page.getByLabel("Name", { exact: true }).fill("MyScript");
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.getByText("MyScript")).toBeVisible();
  await expect(page.getByText("New script")).toHaveCount(0);
  // §7 TRAP: the add flush must have PERSISTED one script (savedLen=1).
  await expect(spy).toContainText("savedLen=1");

  await probe.getByRole("button", { name: "Remove" }).click();
  await expect(spy).toContainText("savedLen=0");
});
