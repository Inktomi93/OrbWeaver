// <Toolbar> CT — Base UI Toolbar behind the layout skin: role=toolbar, the h-control-md Row dress,
// and the roving tabindex (arrow keys move focus between items — the reason Base UI is under here).
import { Toolbar, ToolbarButton, ToolbarGroup, ToolbarInput, ToolbarLink, ToolbarSeparator } from "@orb/ui/layout";
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

  // The separator is a HAIRLINE THAT STRETCHES, and both halves are only observable rendered: `w-px` is an
  // authored 1px rule (not a spacing token — a token-sized divider would be a bar), and `self-stretch` only
  // resolves to the strip's full height while the parent stays a flex row. A separator that renders 0px tall
  // is the flex-child-under-a-block-parent tell, and no source-level check can see it.
  test("ToolbarSeparator renders a full-height hairline with the correct ARIA orientation", async ({ mount }) => {
    const component = await mount(
      <Toolbar aria-label="formatting">
        <ToolbarButton>Bold</ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton>Link</ToolbarButton>
      </Toolbar>,
    );
    const separator = component.getByRole("separator");
    await expect(separator).toHaveAttribute("aria-orientation", "vertical");
    await expect(separator).toHaveCSS("width", "1px");
    await expect(separator).toHaveCSS("height", controlMdPx);
  });
});

// ToolbarGroup is a SEMANTIC boundary, not a flex div: Base UI gives it the group role so a screen
// reader announces the cluster's own name around its buttons, and `disabled` here inerts every item
// inside from one place. A plain <Row> around the same buttons would do neither.
test("ToolbarGroup names its cluster and its disabled state reaches the items inside", async ({ mount }) => {
  const component = await mount(
    <Toolbar aria-label="formatting">
      <ToolbarGroup aria-label="Numerical format">
        <ToolbarButton>Currency</ToolbarButton>
        <ToolbarButton>Percent</ToolbarButton>
      </ToolbarGroup>
      <ToolbarGroup aria-label="Locked" disabled={true}>
        <ToolbarButton>Frozen</ToolbarButton>
      </ToolbarGroup>
    </Toolbar>,
  );
  const group = component.getByRole("group", { name: "Numerical format" });
  await expect(group).toBeVisible();
  await expect(group.getByRole("button")).toHaveCount(2);
  // The group's disabled state cascades onto its item (Base UI's ToolbarGroup `disabled`).
  await expect(component.getByRole("button", { name: "Frozen" })).toHaveAttribute("data-disabled", "");
});

// A bare <a> in a toolbar keeps its OWN tab stop and is skipped by the arrow keys, breaking the
// strip's "one tab stop, arrows within" contract. ToolbarLink joins the roving tabindex — which only
// the rendered focus order can prove.
test("ToolbarLink renders an anchor that joins the roving tabindex", async ({ mount, page }) => {
  const component = await mount(
    <Toolbar aria-label="document">
      <ToolbarButton>Bold</ToolbarButton>
      <ToolbarLink href="/history">Edited 51m ago</ToolbarLink>
    </Toolbar>,
  );
  const link = component.getByRole("link", { name: "Edited 51m ago" });
  await expect(link).toHaveAttribute("href", "/history");
  await component.getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(link).toBeFocused();
});

// The documented NumberField/inputs-in-a-toolbar seam: the input is a toolbar ITEM (arrows reach it)
// while still accepting text.
test("ToolbarInput is reachable by the roving tabindex and still takes text", async ({ mount, page }) => {
  const component = await mount(
    <Toolbar aria-label="search">
      <ToolbarButton>Filter</ToolbarButton>
      <ToolbarInput aria-label="Query" placeholder="Search…" />
    </Toolbar>,
  );
  const input = component.getByRole("textbox", { name: "Query" });
  await component.getByRole("button", { name: "Filter" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(input).toBeFocused();
  await input.fill("dragons");
  await expect(input).toHaveValue("dragons");
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
