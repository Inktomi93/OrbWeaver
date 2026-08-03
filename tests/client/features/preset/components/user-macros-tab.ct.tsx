// CT (WAVE MU): the Macros-tab authoring surface — the Variables-tab add-flow + D78 §10 CT-4 array-op
// persistence, applied to user macros. Adding a macro, naming it, and hitting Done leaves EXACTLY ONE row
// carrying the typed name (no phantom duplicate) AND persists through the BOUNDARY's store driver with
// ZERO call-site flush; Remove persists the empty list the same way. Also pins the deferred browser
// consumer: the builtin-collision lint fires when the name shadows a builtin.
//
// The editor Dialog + its Done button portal to document.body (outside the mounted component root), so the
// dialog interactions use `page`, not the component-scoped `mount` handle.

import { expect, test } from "@playwright/experimental-ct-react";
import { UserMacrosTabStory } from "./_add-flow-stories";

const BUILTIN_LINT = /is a built-in macro/;
/** The row-named Remove trigger (X-3) — the row's stored name depends on whether the collision lint let
 *  the rename through, which is not what this test is about. */
const REMOVE_ROW = /^Remove /;

test("Macros: Add persists one row (no phantom), the builtin-collision lint fires, Remove persists empty", async ({ mount, page }) => {
  const probe = await mount(<UserMacrosTabStory />);
  const spy = probe.locator("output");

  await probe.getByRole("button", { name: "Add macro" }).click();
  await page.getByLabel("Name", { exact: true }).fill("myGloss");
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.getByText("{{myGloss}}")).toBeVisible();
  await expect(page.getByText("new_macro")).toHaveCount(0);
  // CT-4: the store driver PERSISTED one macro (savedLen=1), no call-site flush needed.
  await expect(spy).toContainText("savedLen=1");

  // The deferred browser consumer's collision lint: re-open (click the row) and rename to a BUILTIN → the
  // refusal is shown. The ListRow title is the clickable edit affordance.
  await probe.getByText("{{myGloss}}").click();
  await page.getByLabel("Name", { exact: true }).fill("char");
  await expect(page.getByText(BUILTIN_LINT)).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  // REMOVE CONFIRMS NOW (side-eye X-3): every `EntryListEditor` consumer holds authored content, so the
  // trailing Remove opens an alertdialog naming the row instead of deleting on the first click.
  await probe.getByRole("button", { name: REMOVE_ROW }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(spy).toContainText("savedLen=0");
});
