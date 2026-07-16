// CT: the section-inspector ⋯ actions menu — Delete (north-star §2/§6.2 + §7 autosave trap). The bottom
// Duplicate/Move/Delete button row is now ONE ⋯ menu in the Section header; Delete is ConfirmDialog-wired
// (the recoverable undo-toast retired). Deleting the MIDDLE section (index 1) must remove it from the form
// AND PERSIST the shorter list (`removeFieldValue` doesn't fire the autosave onChange listener, so the menu
// flushes explicitly — §7 TRAP). The live section-id order + the last-saved count (`<output>`) are the
// source of truth. The ⋯ trigger, menu items, and ConfirmDialog portal to document.body → addressed via `page`.

import { expect, test } from "@playwright/experimental-ct-react";
import { DeleteUndoStory } from "./_delete-undo-stories";

test("Section ⋯ → Delete → confirm removes the middle section and persists the shorter list", async ({ mount, page }) => {
  const probe = await mount(<DeleteUndoStory />);
  const state = probe.locator("output");

  // The selected MIDDLE section resolves in the inspector (its Name field carries the section's name — i.e.
  // the body rendered, not the EmptyState), and all three exist.
  await expect(state).toContainText("ids=sec_a,sec_del,sec_z");
  await expect(probe.getByLabel("Name", { exact: true })).toHaveValue("DeleteMe");

  // Open the header ⋯ menu, pick Delete, and confirm in the ConfirmDialog.
  await page.getByRole("button", { name: "Section actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  // The section is gone AND the shorter list PERSISTED (savedCount=2) — the §7 flush reached `save`.
  await expect(state).toContainText("ids=sec_a,sec_z");
  await expect(state).toContainText("savedCount=2");
});

test("Section ⋯ → Duplicate clones the section in place and persists the longer list", async ({ mount, page }) => {
  const probe = await mount(<DeleteUndoStory />);
  const state = probe.locator("output");

  await expect(state).toContainText("ids=sec_a,sec_del,sec_z");

  await page.getByRole("button", { name: "Section actions" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();

  // The clone lands right after the original (4 sections now) and the insert PERSISTED (§7 flush).
  await expect(state).toContainText("savedCount=4");
});
