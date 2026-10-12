// CT: the scope editor's image is seeded PER OPEN, not per mount.
//
// THE DEFECT (refinery lane, 2026-08-14). Both production call sites mount `ScopeEditorDialog`
// permanently beside the session pane and merely gate it with `open`
// (`surfaces/refinery-content-surface.tsx`, `components/refinery-context-tabs.tsx`). Its editable image
// lived in `useState` initializers on the always-mounted component, so it was captured once when the PANE
// mounted. `selection` has a second writer — `refinery.applyFields` remaps it server-side when an accepted
// rewrite removes a greeting — and after that landed, reopening Scope still painted the pane-mount image.
// The next Save then wrote that ancient `fields` array straight back: last-write-wins from a stale image,
// on the one axis the dialog's delta rule does NOT protect (the delta only withholds the GREETING axis).
//
// WHY THE PROP AND NOT THE WIRE: `useApplyRefineryFields` and `useUpdateRefinerySession` are both
// `busDriven: true` — the refetch arrives through the user bus, which a CT cannot fire. The story therefore
// moves the `selection` prop directly, which is the identical input the bus-invalidated refetch delivers.
//
// Every barrier below is a SETTLED state: the dialog's own heading, or a checkbox's resolved checked state.

import { expect, test } from "@playwright/experimental-ct-react";
import { ScopeEditorReopenStory } from "../_ct-stories.tsx";

test("reopening the scope editor after a server-side remap shows the CURRENT selection, not the pane-mount image", async ({ mount, page }) => {
  const component = await mount(<ScopeEditorReopenStory initialFields={["description", "personality"]} remappedFields={["description"]} />);

  // FIRST open — the pane-mount image, both fields in scope. Settled on the dialog's own title.
  await component.getByRole("button", { name: "Open scope" }).click();
  await expect(page.getByRole("heading", { name: "Scope" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "description" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "personality" })).toBeChecked();

  // Close it, then let the SERVER move the selection underneath — the applyFields remap.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Scope" })).toHaveCount(0);
  await component.getByRole("button", { name: "Remap scope" }).click();

  // SECOND open. Pre-fix this repainted the pane-mount image and `personality` was still checked — the
  // stale row a Save would have written back over the remap.
  await component.getByRole("button", { name: "Open scope" }).click();
  await expect(page.getByRole("heading", { name: "Scope" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "description" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "personality" })).not.toBeChecked();
});

// HONEST LABEL: a FENCE, not a defect proof — measured GREEN against the pre-fix source (the pane-mount
// image and the just-saved image happen to agree once the save is the only writer). The defect proof is the
// test above, which reds against HEAD. This one guards the other half of the same seam: a future "reset the
// image only when the SAVE changed it" would pass the first test and break this one.
test("a saved scope survives a reopen — the dialog re-reads the image its own save produced", async ({ mount, page }) => {
  const component = await mount(<ScopeEditorReopenStory initialFields={["description", "personality"]} remappedFields={["description"]} />);

  await component.getByRole("button", { name: "Open scope" }).click();
  await expect(page.getByRole("heading", { name: "Scope" })).toBeVisible();
  await page.getByRole("checkbox", { name: "personality" }).click();
  await expect(page.getByRole("checkbox", { name: "personality" })).not.toBeChecked();
  await page.getByRole("button", { name: "Save scope" }).click();
  await expect(page.getByRole("heading", { name: "Scope" })).toHaveCount(0);

  await component.getByRole("button", { name: "Open scope" }).click();
  await expect(page.getByRole("heading", { name: "Scope" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "description" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "personality" })).not.toBeChecked();
});
