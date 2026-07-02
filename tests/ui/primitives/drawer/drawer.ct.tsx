import {
  Drawer,
  DrawerClose,
  DrawerDescription,
  DrawerPopup,
  DrawerTitle,
  DrawerTrigger,
} from "@orb/ui/drawer";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

test("opens on trigger click and closes on Escape", async ({ mount, page }) => {
  await mount(
    <Drawer>
      <DrawerTrigger>Open filters</DrawerTrigger>
      <DrawerPopup>
        <DrawerTitle>Filters</DrawerTitle>
        <DrawerDescription>Narrow the character list.</DrawerDescription>
        <DrawerClose>Done</DrawerClose>
      </DrawerPopup>
    </Drawer>,
  );

  const popup = page.locator('[data-slot="drawer-popup"]');
  await expect(popup).toBeHidden();

  await page.getByRole("button", { name: "Open filters" }).click();
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Filters");

  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
});

test("panel uses the card token and the backdrop uses the scrim token", async ({ mount, page }) => {
  await mount(
    <Drawer defaultOpen={true}>
      <DrawerPopup>
        <DrawerTitle>Filters</DrawerTitle>
      </DrawerPopup>
    </Drawer>,
  );

  const popup = page.locator('[data-slot="drawer-popup"]');
  await expect(popup).toBeVisible();
  await expect(popup).toHaveCSS("background-color", TOKENS["color.card"].value);

  const backdrop = page.locator('[data-slot="drawer-backdrop"]');
  await expect(backdrop).toHaveCSS("background-color", TOKENS["color.scrim"].value);
});

test("side variants place the panel on the chosen edge", async ({ mount, page }) => {
  await mount(
    <Drawer defaultOpen={true} side="right">
      <DrawerPopup side="right">
        <DrawerTitle>Context</DrawerTitle>
      </DrawerPopup>
    </Drawer>,
  );

  const popup = page.locator('[data-slot="drawer-popup"]');
  await expect(popup).toBeVisible();

  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error("viewport size unavailable");
  }
  const box = await popup.boundingBox();
  if (box === null) {
    throw new Error("drawer popup has no bounding box");
  }
  // Right drawer: flush to the right edge, full height.
  expect(box.x + box.width).toBeCloseTo(viewport.width, 0);
  expect(box.height).toBeCloseTo(viewport.height, 0);
});

test("close button dismisses the drawer", async ({ mount, page }) => {
  await mount(
    <Drawer defaultOpen={true}>
      <DrawerPopup>
        <DrawerTitle>Filters</DrawerTitle>
        <DrawerClose>Done</DrawerClose>
      </DrawerPopup>
    </Drawer>,
  );

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator('[data-slot="drawer-popup"]')).toBeHidden();
});
