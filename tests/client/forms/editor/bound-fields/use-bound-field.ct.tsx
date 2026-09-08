// CT: the TanStack↔Base UI state sync `useBoundField` owns (crunch item 3, LANE NAVFORM).
//
// The crunch's claim was that `useBoundField` drops `dirty`/`touched`, and that the trigger-based
// primitives (Select/Combobox/ColorField/MultiToggle) cannot receive `field.handleBlur` at all — so Base
// UI could never paint `data-dirty`/`data-touched` and any CSS keyed on them was permanently dead. Both
// halves were closed in the Base UI 1.7 base (`d732be317`); nothing PROVED it, which is what this file is.
// It reads the RENDERED attributes on `<Field.Root>`, never the form state that feeds them — the whole
// defect class lived in the gap between the two.
//
// Blur for a trigger-based control is NOT a DOM blur. `Select`/`ColorField` commit touch on their popup
// CLOSING (`onOpenChange(false) → field.handleBlur()`), because the trigger keeps focus while the popup is
// open and a DOM blur would fire on every open. So the touch assertions below drive open→close, not a
// focus move — pinning the seam as built, not a blur that would never arrive.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { BoundFieldsStory } from "./_ct-stories.tsx";

/** The `<Field.Root>` owning the row whose label reads `label`. */
function fieldRoot(root: Locator, label: string): Locator {
  return root.locator('[data-slot="field-root"]').filter({ has: root.page().getByText(label, { exact: true }) });
}

test("a bound text field paints data-dirty on edit and data-touched on blur", async ({ mount, page }) => {
  const story = await mount(<BoundFieldsStory />);
  const row = fieldRoot(story, "Display name");
  await expect(row).not.toHaveAttribute("data-dirty", "");
  await expect(row).not.toHaveAttribute("data-touched", "");

  await story.getByRole("textbox", { name: "Display name" }).fill("Elara");
  await expect(row).toHaveAttribute("data-dirty", "");

  // Touch arrives on blur, not on change — move focus off the control.
  await page.keyboard.press("Tab");
  await expect(row).toHaveAttribute("data-touched", "");
});

test("a bound SELECT commits touch when its popup closes (handleBlur rides onOpenChange)", async ({ mount, page }) => {
  const story = await mount(<BoundFieldsStory />);
  const row = fieldRoot(story, "Variant");
  await expect(row).not.toHaveAttribute("data-touched", "");

  await story.getByRole("combobox", { name: "Variant" }).click();
  await page.getByRole("option", { name: "Beta" }).click();

  await expect(row).toHaveAttribute("data-touched", "");
  await expect(row).toHaveAttribute("data-dirty", "");
});

test("a bound COLOR field commits touch when its popup closes", async ({ mount, page }) => {
  const story = await mount(<BoundFieldsStory />);
  const row = fieldRoot(story, "Accent");
  await expect(row).not.toHaveAttribute("data-touched", "");

  await story.getByRole("button", { name: "Accent" }).click();
  await expect(page.getByRole("textbox", { name: "Hex" })).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(row).toHaveAttribute("data-touched", "");
});

test("a bound MULTI-TOGGLE group paints dirty on select and touched on blur", async ({ mount, page }) => {
  const story = await mount(<BoundFieldsStory />);
  const row = fieldRoot(story, "Surfaces");

  await story.getByRole("button", { name: "Panels" }).click();
  await expect(row).toHaveAttribute("data-dirty", "");

  await page.keyboard.press("Tab");
  await expect(row).toHaveAttribute("data-touched", "");
});

test("a bound SWITCH paints dirty on toggle and touched on blur", async ({ mount, page }) => {
  const story = await mount(<BoundFieldsStory />);
  const row = fieldRoot(story, "Streaming");

  await story.getByRole("switch", { name: "Streaming" }).click();
  await expect(row).toHaveAttribute("data-dirty", "");

  await page.keyboard.press("Tab");
  await expect(row).toHaveAttribute("data-touched", "");
});

test("every bound field's control inherits an id or a name from field context (no hardcoded ids)", async ({ mount }) => {
  const story = await mount(<BoundFieldsStory />);
  const bare = await story.evaluate((el: Element) => {
    const out: string[] = [];
    for (const control of el.querySelectorAll("input, textarea, select")) {
      if ((control.getAttribute("id") ?? "") === "" && (control.getAttribute("name") ?? "") === "") {
        out.push(control.outerHTML.slice(0, 160));
      }
    }
    return out;
  });
  expect(bare, `unidentified bound-field controls:\n${bare.join("\n")}`).toEqual([]);
});
