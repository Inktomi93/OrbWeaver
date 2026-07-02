import {
  Drawer,
  DrawerClose,
  DrawerDescription,
  DrawerIndent,
  DrawerIndentBackground,
  DrawerPopup,
  DrawerProvider,
  DrawerSwipeArea,
  DrawerTitle,
  DrawerTrigger,
  DrawerVirtualKeyboardProvider,
} from "@orb/ui/drawer";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { DrawerHandleHarness } from "./drawer-handle.fixtures";

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

test("swipe area mounts as an edge hit-target", async ({ mount, page }) => {
  await mount(
    <Drawer side="bottom">
      <DrawerSwipeArea side="bottom" />
      <DrawerTrigger>Open filters</DrawerTrigger>
      <DrawerPopup>
        <DrawerTitle>Filters</DrawerTitle>
      </DrawerPopup>
    </Drawer>,
  );

  // The swipe-to-OPEN edge target is always present, even while the drawer is closed.
  await expect(page.locator('[data-slot="drawer-swipe-area"]')).toBeAttached();
  await expect(page.locator('[data-slot="drawer-popup"]')).toBeHidden();
});

test("provider + indent coordinate depth — indent gains data-active when a drawer opens", async ({
  mount,
  page,
}) => {
  await mount(
    <DrawerProvider>
      <DrawerIndentBackground />
      <DrawerIndent>
        <Drawer>
          <DrawerTrigger>Open filters</DrawerTrigger>
          <DrawerPopup>
            <DrawerTitle>Filters</DrawerTitle>
          </DrawerPopup>
        </Drawer>
      </DrawerIndent>
    </DrawerProvider>,
  );

  const indent = page.locator('[data-slot="drawer-indent"]');
  await expect(indent).toBeAttached();
  await expect(indent).not.toHaveAttribute("data-active");

  await page.getByRole("button", { name: "Open filters" }).click();
  await expect(page.locator('[data-slot="drawer-popup"]')).toBeVisible();
  // The Provider tells the Indent (and IndentBackground) that a drawer within it is open.
  await expect(indent).toHaveAttribute("data-active");
  await expect(page.locator('[data-slot="drawer-indent-background"]')).toHaveAttribute(
    "data-active",
  );
});

test("virtual-keyboard provider mounts inside the drawer and it still opens", async ({
  mount,
  page,
}) => {
  // The provider consumes the Drawer root context + viewport (verified against the shipped source),
  // so it must sit INSIDE <Drawer> wrapping the popup — not around the whole Drawer.
  await mount(
    <Drawer>
      <DrawerTrigger>Open filters</DrawerTrigger>
      <DrawerVirtualKeyboardProvider>
        <DrawerPopup>
          <DrawerTitle>Filters</DrawerTitle>
          <DrawerDescription>Reflows above the mobile keyboard.</DrawerDescription>
        </DrawerPopup>
      </DrawerVirtualKeyboardProvider>
    </Drawer>,
  );

  await page.getByRole("button", { name: "Open filters" }).click();
  await expect(page.locator('[data-slot="drawer-popup"]')).toBeVisible();
});

// createHandle: open the drawer imperatively (no trigger) with a payload via handle.openWithPayload;
// the payload reaches the Root render-function children (harness in ./drawer-handle.fixtures). Base
// UI drawer re-exports the dialog createHandle mechanism.
test("opens imperatively via a detached handle and routes the payload to content", async ({
  mount,
  page,
}) => {
  await mount(<DrawerHandleHarness />);
  await expect(page.locator('[data-slot="drawer-popup"]')).toBeHidden();
  await page.getByRole("button", { name: "Open remotely" }).click();
  const popup = page.locator('[data-slot="drawer-popup"]');
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Reached content");
});
