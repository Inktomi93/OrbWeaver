import { SNAPPED_LENGTH_BASE_PX } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { ToolbarNativePartsStory } from "./toolbar-native-parts-stories.tsx";

test("toolbar native items share arrow navigation, disabled groups and keyboard activation", async ({ mount, page }) => {
  const component = await mount<typeof ToolbarNativePartsStory>("tests/ui/layout/toolbar-native-parts-stories/ToolbarNativePartsStory");
  const toolbar = component.getByRole("toolbar", { name: "Document tools", exact: true });
  await expect(toolbar.getByRole("group", { name: "Formatting", exact: true }).getByRole("button")).toHaveCount(2);
  await expect(toolbar.getByRole("group", { name: "Locked", exact: true }).getByRole("button", { name: "Frozen", exact: true })).toBeDisabled();
  const bold = toolbar.getByRole("button", { name: "Bold", exact: true });
  await bold.focus();
  await page.keyboard.press("Enter");
  await expect(component.getByRole("status", { name: "Bold activations", exact: true })).toHaveText("1");
  await page.keyboard.press("ArrowRight");
  await expect(toolbar.getByRole("button", { name: "Italic", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(bold).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const link = toolbar.getByRole("link", { name: "Document history", exact: true });
  await expect(link).toBeFocused();
  await expect(link).toHaveAttribute("href", "#document-history");
  await page.keyboard.press("ArrowRight");
  const input = toolbar.getByRole("textbox", { name: "Query", exact: true });
  await expect(input).toBeFocused();
  await input.fill("dragons");
  await expect(input).toHaveValue("dragons");
});

test.describe("coarse-pointer toolbar geometry", () => {
  test.use({ hasTouch: true });

  test("the separator remains a full-height vertical hairline in the control strip", async ({ mount }) => {
    const component = await mount<typeof ToolbarNativePartsStory>("tests/ui/layout/toolbar-native-parts-stories/ToolbarNativePartsStory");
    const toolbar = component.getByRole("toolbar", { name: "Document tools", exact: true });
    const height = `${SNAPPED_LENGTH_BASE_PX["spacing.control-md"]}px`;
    await expect(toolbar).toHaveCSS("display", "flex");
    await expect(toolbar).toHaveCSS("height", height);
    const separator = toolbar.getByRole("separator");
    await expect(separator).toHaveAttribute("aria-orientation", "vertical");
    await expect(separator).toHaveCSS("width", "1px");
    await expect(separator).toHaveCSS("height", height);
  });
});
