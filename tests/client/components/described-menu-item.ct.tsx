import { accessibilityScan } from "@orb/testkit/browser/spec";
import { attachNativeFile } from "@orb/testkit/node/helpers";
import { expect, test } from "@playwright/test";
import type { DescribedMenuItemStory, MenuNameDetectorControlsStory } from "./_described-menu-item-stories.tsx";

const STORY = "tests/client/components/_described-menu-item-stories/DescribedMenuItemStory";
const CONTROLS_STORY = "tests/client/components/_described-menu-item-stories/MenuNameDetectorControlsStory";
const LABEL_MISMATCH = "label-content-name-mismatch";

test("the native detector finds a deliberate label mismatch and accepts the healthy command", async ({ mount, page }, testInfo) => {
  await mount<typeof MenuNameDetectorControlsStory>(CONTROLS_STORY);
  await page.getByRole("button", { name: "Detector controls", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Healthy command", exact: true })).toBeVisible();
  const planted = page.getByRole("menuitem", { name: "Unrelated command", exact: true });
  await expect(planted).toHaveText("Visible command");
  const result = await accessibilityScan(page);
  await attachNativeFile(testInfo, testInfo, "vendor-axe-controls.json", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  const mismatch = result.violations.find((violation) => violation.id === LABEL_MISMATCH);
  expect(mismatch?.nodes).toHaveLength(1);
  expect(mismatch?.nodes[0]?.target).toEqual([await planted.evaluate((element) => `#${CSS.escape(element.id)}`)]);
});

test("described commands retain exact action names, readable descriptions and unmodified vendor evidence", async ({ mount, page }, testInfo) => {
  testInfo.annotations.push({
    type: "accessibility-review",
    description:
      "Duplicate and Export are the visible action labels; their separate explanatory sentences are descriptions. Retain raw axe findings for review; this case asserts browser semantics, not vendor-rule silence or AT platform conformance.",
  });
  await mount<typeof DescribedMenuItemStory>(STORY);
  await page.getByRole("button", { name: "Document actions", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Archive", exact: true })).toBeVisible();
  const duplicate = page.getByRole("menuitem", { name: "Duplicate", exact: true });
  const unavailable = page.getByRole("menuitem", { name: "Export", exact: true });
  await expect(duplicate).toHaveAccessibleDescription("Create an independent copy.");
  await expect(unavailable).toBeDisabled();
  await expect(unavailable).toHaveAccessibleDescription("Choose a format before exporting.");
  await expect(page.getByText("Create an independent copy.", { exact: true })).toBeVisible();
  await expect(page.getByText("Choose a format before exporting.", { exact: true })).toBeVisible();
  const result = await accessibilityScan(page);
  await attachNativeFile(testInfo, testInfo, "vendor-axe-described-commands.json", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
});

test("the native menu keeps typeahead, keyboard activation, checkbox state and detail-line pointer activation", async ({ mount, page }, testInfo) => {
  await mount<typeof DescribedMenuItemStory>(STORY);
  const trigger = page.getByRole("button", { name: "Document actions", exact: true });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Archive", exact: true })).toBeFocused();
  await page.keyboard.press("d");
  const duplicate = page.getByRole("menuitem", { name: "Duplicate", exact: true });
  await expect(duplicate).toBeFocused();
  await expect(duplicate).toHaveAttribute("data-highlighted", "");
  await attachNativeFile(testInfo, testInfo, "described-command-focused.png", { body: await page.screenshot(), contentType: "image/png" });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status", { name: "Last command", exact: true })).toHaveText("Duplicate");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  const check = page.getByRole("menuitemcheckbox", { name: "Keep open", exact: true });
  await check.focus();
  await page.keyboard.press("Space");
  await expect(check).toHaveAttribute("aria-checked", "true");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole("menuitem", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("status", { name: "Last command", exact: true })).toHaveText("Archive");
  await trigger.click();
  await page.getByText("Create an independent copy.", { exact: true }).click();
  await expect(page.getByRole("status", { name: "Last command", exact: true })).toHaveText("Duplicate");
  await expect(menu).toBeHidden();
});
