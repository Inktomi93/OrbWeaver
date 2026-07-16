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
import { DrawerHandleHarness, DrawerTriggerPayloadHarness } from "./drawer-handle.fixtures";

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

test("provider + indent coordinate depth — indent gains data-active when a drawer opens", async ({ mount, page }) => {
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
  await expect(page.locator('[data-slot="drawer-indent-background"]')).toHaveAttribute("data-active");
});

test("virtual-keyboard provider mounts inside the drawer and it still opens", async ({ mount, page }) => {
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

// Base UI Drawer defaults `modal={true}` — focus trap + document scroll lock come free. This CT
// asserts the CONTRACT, not just trusts it: Tab never escapes the popup to the outside siblings, and
// closing returns focus to the trigger that opened it (menu/select already model this Tab-containment
// shape; dialog/alert-dialog/drawer previously leaned on "Base UI is free" with no assertion).
test("focus is trapped inside the popup and returns to the trigger on close", async ({ mount, page }) => {
  await mount(
    <>
      <button type="button">Outside before</button>
      <Drawer>
        <DrawerTrigger>Open filters</DrawerTrigger>
        <DrawerPopup>
          <DrawerTitle>Filters</DrawerTitle>
          <button type="button">First field</button>
          <button type="button">Second field</button>
          <DrawerClose>Done</DrawerClose>
        </DrawerPopup>
      </Drawer>
      <button type="button">Outside after</button>
    </>,
  );

  const trigger = page.getByRole("button", { name: "Open filters" });
  await trigger.click();
  const popup = page.locator('[data-slot="drawer-popup"]');
  await expect(popup).toBeVisible();

  // Tab through more presses than there are focusable items (First/Second/Done = 3) so the cycle
  // wraps at least once — focus must stay inside the popup at every step. Unrolled (not a loop) —
  // each Tab depends on the prior one's settled focus, so this is a biome noAwaitInLoops
  // false-positive to sidestep.
  await page.keyboard.press("Tab");
  await expect(popup.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(popup.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(popup.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(popup.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(popup.locator(":focus")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect(trigger).toBeFocused();
});

// createHandle: open the drawer imperatively (no trigger) with a payload via handle.openWithPayload;
// the payload reaches the Root render-function children (harness in ./drawer-handle.fixtures). Base
// UI drawer re-exports the dialog createHandle mechanism.
test("opens imperatively via a detached handle and routes the payload to content", async ({ mount, page }) => {
  await mount(<DrawerHandleHarness />);
  await expect(page.locator('[data-slot="drawer-popup"]')).toBeHidden();
  await page.getByRole("button", { name: "Open remotely" }).click();
  const popup = page.locator('[data-slot="drawer-popup"]');
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Reached content");
});

// DrawerTrigger<Payload> generic (real type regression fixed — it was non-generic while
// Dialog/AlertDialogTrigger both are): two DETACHED triggers, each carrying its own `payload`, wired
// to ONE handle-driven drawer. Clicking either trigger routes THAT trigger's payload to content —
// proves the generic actually threads a payload type through the trigger, not just the root.
test("a detached DrawerTrigger carries its own payload to a handle-driven drawer", async ({ mount, page }) => {
  await mount(<DrawerTriggerPayloadHarness />);
  const popup = page.locator('[data-slot="drawer-popup"]');
  await expect(popup).toBeHidden();

  await page.getByRole("button", { name: "Trigger B" }).click();
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("From trigger B");
});
