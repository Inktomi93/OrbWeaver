// CT: the button seal — token variants land as computed style, sizes hold the touch floor,
// loading is a real disabled+aria-busy state (ui-package-design §6.1).

import { Button } from "@orb/ui/button";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color";

const TOUCH_FLOOR_PX = 44;

test("primary intent lands as the primary token background", async ({ mount }) => {
  const button = await mount(<Button>Save</Button>);
  await expect(button).toHaveCSS("background-color", TOKENS["color.primary"].value);
});

test("destructive intent swaps to the destructive token", async ({ mount }) => {
  const button = await mount(<Button intent="destructive">Delete</Button>);
  await expect(button).toHaveCSS("background-color", resolvedTokenColor("color.destructive"));
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

  test("wrap size keeps the floor for a short label (its height is a MINIMUM, not a release)", async ({ mount }) => {
    const button = await mount(<Button size="wrap">Go</Button>);
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
  });

  test("icon size is a square control meeting the floor with no horizontal padding", async ({ mount }) => {
    const button = await mount(<Button aria-label="Regenerate" size="icon" />);
    const box = await button.boundingBox();
    expect(box?.width).toBeCloseTo(box?.height ?? 0, 0);
    expect(box?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
    await expect(button).toHaveCSS("padding-left", "0px");
    await expect(button).toHaveCSS("padding-right", "0px");
  });
});

// `media` is the CONTENT-SIZED arm: the child (a portrait/media element) defines the box, so the visible
// thing and the hit target are the same rectangle. Every other size pins a control height, which is how a
// 64px avatar came to paint outside its own 34px trigger on the character hero (stickler 2026-08-01 F2).
const MEDIA_CHILD_PX = 64;

test("media size takes its child's box exactly, with no padding of its own", async ({ mount }) => {
  const button = await mount(
    <Button aria-label="Replace portrait" size="media">
      <span data-testid="media-child" style={{ display: "block", height: MEDIA_CHILD_PX, width: MEDIA_CHILD_PX }} />
    </Button>,
  );
  const box = await button.boundingBox();
  expect(box?.width).toBeCloseTo(MEDIA_CHILD_PX, 0);
  expect(box?.height).toBeCloseTo(MEDIA_CHILD_PX, 0);
  await expect(button).toHaveCSS("padding-left", "0px");
  await expect(button).toHaveCSS("padding-top", "0px");
});

// `wrap` is the MULTILINE arm: a choice affordance carrying a model-authored sentence. The label wraps
// inside a constrained column and the box GROWS with it — the geometry a call-site `h-auto` could not
// buy, since a custom-token height is opaque to tailwind-merge and the winner fell out of stylesheet
// order (the two choice-button debt sites the ui-size-via-variant gate held).
const WRAP_COLUMN_PX = 180;
const WRAP_LABEL = "1. Take the long way round the ridge and approach the camp from the treeline at dusk";

test("wrap size wraps its label and grows taller than the single-line sm control", async ({ mount, page }) => {
  await mount(
    <div style={{ width: WRAP_COLUMN_PX }}>
      <Button size="sm">Go</Button>
      <Button size="wrap">{WRAP_LABEL}</Button>
    </div>,
  );
  const singleLine = await page.getByRole("button", { name: "Go" }).boundingBox();
  const wrapped = await page.getByRole("button", { name: WRAP_LABEL }).boundingBox();
  // It stayed inside the column (it wrapped) instead of overflowing on one nowrap line …
  expect(wrapped?.width ?? 0).toBeLessThanOrEqual(WRAP_COLUMN_PX);
  // … and the box followed the wrapped text past the fixed control height.
  expect(wrapped?.height ?? 0).toBeGreaterThan(singleLine?.height ?? 0);
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

test("a caller-supplied focusableWhenDisabled overrides the loading default", async ({ mount, page }) => {
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

test("secondary is BORDERED — a border-token outline over a transparent surface (D62 P5)", async ({ mount }) => {
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
  const readBackgroundColor = (): Promise<string> => button.evaluate((el) => getComputedStyle(el).backgroundColor);
  await control.hover();
  const hoverColor = await readBackgroundColor();
  await page.mouse.down();
  // `transition-colors` animates the swap — poll past the transition instead of racing one frame.
  await expect.poll(readBackgroundColor, { intervals: [20, 50, 100] }).not.toBe(hoverColor);
  await page.mouse.up();
});

test("active press scales the surface down (motion guide §4.2 #4)", async ({ mount, page }) => {
  const button = await mount(<Button>Save</Button>);
  const control = page.getByRole("button", { name: "Save" });
  // Tailwind v4 `scale-95` drives the standalone `scale` CSS PROPERTY, not the `transform` matrix.
  const readScale = (): Promise<string> => button.evaluate((el) => getComputedStyle(el).scale);
  // At rest the button is unscaled (`scale: none`).
  expect(await readScale()).toBe("none");
  await control.hover();
  await page.mouse.down();
  // The transition animates `scale` from 1 down to 0.95 — poll the parsed value into the pressed band
  // (the intermediate frames read as 0.95<v≤1, so assert on the settled value, not the first non-none).
  await expect
    .poll(
      async () => {
        const v = await readScale();
        return v === "none" ? 1 : Number.parseFloat(v);
      },
      { intervals: [20, 50, 100] },
    )
    .toBeLessThan(0.97);
  await page.mouse.up();
  // Released: scale returns to identity (`none`), proving the press is transient, not sticky.
  await expect(button).toHaveCSS("scale", "none");
});

test("keyboard focus shows a focus-visible ring", async ({ mount, page }) => {
  // `secondary`, not the default `primary`: the ring is a `box-shadow`, and `primary` now carries a
  // resting `shadow-cta` top-highlight (also a box-shadow) that would confound the none→ring proxy.
  // The focus ring is a base-layer behavior identical across intents, so a shadowless intent isolates it.
  const button = await mount(<Button intent="secondary">Save</Button>);
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
  await expect.poll(() => clicks.length, { intervals: [20, 50, 100] }).toBe(2);
});
