// CT: the button seal — token variants land as computed style, sizes hold the touch floor,
// loading is a real disabled+aria-busy state (ui-package-design §6.1).

import { Button } from "@orb/ui/button";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

const TOUCH_FLOOR_PX = 44;

test("primary intent lands as the primary token background", async ({ mount }) => {
  const button = await mount(<Button>Save</Button>);
  await expect(button).toHaveCSS("background-color", TOKENS["color.primary"].value);
});

test("destructive intent swaps to the destructive token", async ({ mount }) => {
  const button = await mount(<Button intent="destructive">Delete</Button>);
  await expect(button).toHaveCSS("background-color", TOKENS["color.destructive"].value);
});

test("every size meets the 44px touch floor; lg is taller than sm", async ({ mount }) => {
  const small = await mount(<Button size="sm">Save</Button>);
  const smallBox = await small.boundingBox();
  expect(smallBox?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
  await small.unmount();
  const large = await mount(<Button size="lg">Save</Button>);
  const largeBox = await large.boundingBox();
  expect(largeBox?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
  expect(largeBox?.height ?? 0).toBeGreaterThan(smallBox?.height ?? 0);
});

test("loading sets aria-busy and disables the button", async ({ mount }) => {
  const button = await mount(<Button loading={true}>Save</Button>);
  await expect(button).toHaveAttribute("aria-busy", "true");
  await expect(button).toBeDisabled();
});

test("icon size is a square control with no horizontal padding", async ({ mount }) => {
  const button = await mount(<Button aria-label="Regenerate" size="icon" />);
  const box = await button.boundingBox();
  expect(box?.width).toBeCloseTo(box?.height ?? 0, 0);
  expect(box?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
  await expect(button).toHaveCSS("padding-left", "0px");
  await expect(button).toHaveCSS("padding-right", "0px");
});

test("plain disabled is removed from the tab order", async ({ mount, page }) => {
  await mount(
    <div>
      <Button>Before</Button>
      <Button disabled={true}>Save</Button>
    </div>,
  );
  await page.getByRole("button", { name: "Before" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Save" })).not.toBeFocused();
});

test("loading keeps the button in the tab order for assistive tech", async ({ mount, page }) => {
  await mount(
    <div>
      <Button>Before</Button>
      <Button loading={true}>Save</Button>
    </div>,
  );
  await page.getByRole("button", { name: "Before" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Save" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Save" })).toHaveAttribute("aria-disabled", "true");
});

test("a caller-supplied focusableWhenDisabled overrides the loading default", async ({
  mount,
  page,
}) => {
  await mount(
    <div>
      <Button>Before</Button>
      <Button focusableWhenDisabled={false} loading={true}>
        Save
      </Button>
    </div>,
  );
  await page.getByRole("button", { name: "Before" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Save" })).not.toBeFocused();
});

test("hover swaps the ghost intent to the accent token", async ({ mount, page }) => {
  const button = await mount(<Button intent="ghost">Save</Button>);
  await page.getByRole("button", { name: "Save" }).hover();
  await expect(button).toHaveCSS("background-color", TOKENS["color.accent"].value);
});

test("active press darkens the primary intent from its hover color", async ({ mount, page }) => {
  const button = await mount(<Button>Save</Button>);
  const control = page.getByRole("button", { name: "Save" });
  const readBackgroundColor = (): Promise<string> =>
    button.evaluate((el) => getComputedStyle(el).backgroundColor);
  await control.hover();
  const hoverColor = await readBackgroundColor();
  await page.mouse.down();
  // `transition-colors` animates the swap — poll past the transition instead of racing one frame.
  await expect.poll(readBackgroundColor).not.toBe(hoverColor);
  await page.mouse.up();
});

test("keyboard focus shows a focus-visible ring", async ({ mount, page }) => {
  const button = await mount(<Button>Save</Button>);
  await expect(button).toHaveCSS("box-shadow", "none");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Save" })).toBeFocused();
  const shadow = await button.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).not.toBe("none");
});

test("Enter and Space activate the button", async ({ mount, page }) => {
  const clicks: string[] = [];
  await mount(
    <Button
      onClick={(): void => {
        clicks.push("hit");
      }}
    >
      Save
    </Button>,
  );
  await page.getByRole("button", { name: "Save" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press(" ");
  await expect.poll(() => clicks.length).toBe(2);
});
