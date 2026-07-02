// <Toolbar> CT — Base UI Toolbar behind the layout skin: role=toolbar, the h-control-md Row dress,
// and the roving tabindex (arrow keys move focus between items — the reason Base UI is under here).
import { Toolbar, ToolbarButton } from "@orb/ui/layout";
import { expect, test } from "@playwright/experimental-ct-react";

test("renders role=toolbar with the control-md Row skin", async ({ mount }) => {
  const component = await mount(
    <Toolbar aria-label="formatting">
      <ToolbarButton>Bold</ToolbarButton>
    </Toolbar>,
  );
  await expect(component).toHaveRole("toolbar");
  await expect(component).toHaveCSS("display", "flex");
  await expect(component).toHaveCSS("height", "48px");
  await expect(component).toHaveCSS("column-gap", "8px");
});

test("arrow keys rove focus across toolbar buttons", async ({ mount, page }) => {
  const component = await mount(
    <Toolbar aria-label="actions">
      <ToolbarButton>One</ToolbarButton>
      <ToolbarButton>Two</ToolbarButton>
    </Toolbar>,
  );
  await component.getByRole("button", { name: "One" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(component.getByRole("button", { name: "Two" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(component.getByRole("button", { name: "One" })).toBeFocused();
});
