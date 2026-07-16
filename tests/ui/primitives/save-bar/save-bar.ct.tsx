// CT: the save-bar chrome seal — title + kind label left, the actions slot right, sticky
// placement, and the source/keyboard order running title → actions (ui-package-design §6.1,
// work-order #22). Layout chrome only — no dirty/save logic to assert here.

import { SaveBar } from "@orb/ui/save-bar";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

test("renders the title and kind label", async ({ mount }) => {
  const bar = await mount(<SaveBar kind="Character" title="Aria" />);
  await expect(bar.getByText("Aria")).toBeVisible();
  await expect(bar.getByText("Character")).toBeVisible();
});

test("children render in the actions slot on the right", async ({ mount }) => {
  const bar = await mount(
    <SaveBar kind="Character" title="Aria">
      <button type="button">Save</button>
    </SaveBar>,
  );
  const label = bar.locator('[data-slot="save-bar-label"]');
  const actions = bar.locator('[data-slot="save-bar-actions"]');
  await expect(actions.getByRole("button", { name: "Save" })).toBeVisible();
  const labelBox = await label.boundingBox();
  const actionsBox = await actions.boundingBox();
  expect(labelBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(actionsBox?.x ?? 0).toBeGreaterThan((labelBox?.x ?? 0) + (labelBox?.width ?? 0) - 1);
});

test("defaults to the sticky footer placement", async ({ mount }) => {
  const root = await mount(<SaveBar kind="Character" title="Aria" />);
  await expect(root).toHaveCSS("position", "sticky");
  await expect(root).toHaveCSS("bottom", "0px");
  await expect(root).toHaveCSS("border-top-color", TOKENS["color.border"].value);
});

test("the header sticky variant docks to the top with a bottom border", async ({ mount }) => {
  const root = await mount(<SaveBar kind="Character" title="Aria" sticky="header" />);
  await expect(root).toHaveCSS("position", "sticky");
  await expect(root).toHaveCSS("top", "0px");
  await expect(root).toHaveCSS("border-bottom-color", TOKENS["color.border"].value);
});

test("keyboard order runs title then actions (DOM/tab order, source-ordered flex)", async ({ mount, page }) => {
  const bar = await mount(
    <SaveBar kind="Character" title="Aria">
      <button type="button">Discard</button>
      <button type="button">Save</button>
    </SaveBar>,
  );
  const labelBeforeActions = await bar.evaluate((el) => {
    const html = el.innerHTML;
    return html.indexOf('data-slot="save-bar-label"') < html.indexOf('data-slot="save-bar-actions"');
  });
  expect(labelBeforeActions).toBe(true);

  await page.keyboard.press("Tab");
  await expect(bar.getByRole("button", { name: "Discard" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(bar.getByRole("button", { name: "Save" })).toBeFocused();
});
