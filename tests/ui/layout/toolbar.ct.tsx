// <Toolbar> CT — Base UI Toolbar behind the layout skin: role=toolbar, the h-control-md Row dress,
// and the roving tabindex (arrow keys move focus between items — the reason Base UI is under here).
import { Toolbar, ToolbarButton } from "@orb/ui/layout";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

// control-md is authored in rem; the rendered box resolves to px (root = 16px).
const ROOT_PX = 16;
const controlMdPx = `${Number.parseFloat(TOKENS["spacing.control-md"].value) * ROOT_PX}px`;

// The control-md skin height is pointer-CONDITIONAL (D62 P1): 48px at coarse, 34px at fine. This is a
// skin test (asserts the control-md dress), so it emulates a coarse pointer (hasTouch → pointer:coarse,
// the tokens/index.ct.tsx precedent) and asserts the token's coarse value — never a magic number.
test.describe("coarse pointer — the control-md skin", () => {
  test.use({ hasTouch: true });

  test("renders role=toolbar with the control-md Row skin", async ({ mount }) => {
    const component = await mount(
      <Toolbar aria-label="formatting">
        <ToolbarButton>Bold</ToolbarButton>
      </Toolbar>,
    );
    await expect(component).toHaveRole("toolbar");
    await expect(component).toHaveCSS("display", "flex");
    await expect(component).toHaveCSS("height", controlMdPx);
    await expect(component).toHaveCSS("column-gap", "8px");
  });
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
