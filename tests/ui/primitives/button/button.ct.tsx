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

// The ≥44px touch floor is a COARSE-pointer guarantee (D62 P1) — control heights narrow on fine
// pointers, so these run under an emulated coarse pointer (hasTouch → pointer:coarse, the
// tokens/index.ct.tsx precedent). Without it the default Desktop-Chrome CT is a FINE pointer and the
// heights are the intentional desktop scale (28/34/40), not the floor.
test.describe("coarse pointer — the touch floor", () => {
  test.use({ hasTouch: true });

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

  test("icon size is a square control meeting the floor with no horizontal padding", async ({
    mount,
  }) => {
    const button = await mount(<Button aria-label="Regenerate" size="icon" />);
    const box = await button.boundingBox();
    expect(box?.width).toBeCloseTo(box?.height ?? 0, 0);
    expect(box?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
    await expect(button).toHaveCSS("padding-left", "0px");
    await expect(button).toHaveCSS("padding-right", "0px");
  });
});

test("loading sets aria-busy and disables the button", async ({ mount }) => {
  const button = await mount(<Button loading={true}>Save</Button>);
  await expect(button).toHaveAttribute("aria-busy", "true");
  await expect(button).toBeDisabled();
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

test("ghost defaults to the muted-foreground text token at rest (D62 P5)", async ({ mount }) => {
  const button = await mount(<Button intent="ghost">Save</Button>);
  await expect(button).toHaveCSS("color", TOKENS["color.muted-foreground"].value);
});

test("secondary is BORDERED — a border-token outline over a transparent surface (D62 P5)", async ({
  mount,
}) => {
  const button = await mount(<Button intent="secondary">Cancel</Button>);
  // The old solid `--secondary` fill is GONE (retuned to a transparent bordered surface) …
  await expect(button).not.toHaveCSS("background-color", TOKENS["color.secondary"].value);
  // … replaced by a 1px --color-border outline.
  await expect(button).toHaveCSS("border-top-color", TOKENS["color.border"].value);
  await expect(button).toHaveCSS("border-top-width", "1px");
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
