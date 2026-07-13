// CT: the section-inspector recoverable delete (BUILD-SPEC §3.5 P0 1b). Deleting a section must drop it
// from the form AND raise an Undo toast whose action restores it at its original index — no silent,
// irreversible loss. The live section-id order (`<output>`) is the source of truth: `sec_del` leaves on
// delete and returns in place on Undo.

import { expect, test } from "@playwright/experimental-ct-react";
import { DeleteUndoStory } from "./_delete-undo-stories";

test("Delete raises an Undo toast that restores the section at its original index", async ({
  mount,
  page,
}) => {
  const probe = await mount(<DeleteUndoStory />);
  const ids = probe.locator("output");

  // The selected section resolves in the inspector (its Name field carries the section's name, and the
  // Delete affordance is present — i.e. the body rendered, not the EmptyState), and all three exist.
  await expect(ids).toHaveText("ids=sec_a,sec_hist,sec_del");
  await expect(probe.getByLabel("Name", { exact: true })).toHaveValue("DeleteMe");

  await probe.getByRole("button", { name: "Delete" }).click();

  // The section is gone and the recoverable-delete toast + its Undo action are shown (the toast portals
  // to document.body, so it's addressed via `page`, not the component-scoped handle).
  await expect(ids).toHaveText("ids=sec_a,sec_hist");
  await expect(page.getByText("Section removed")).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();

  // Restored at its original index (2), not appended.
  await expect(ids).toHaveText("ids=sec_a,sec_hist,sec_del");
});
