// CT: the toggle seal — a two-state pressable button; pointer + keyboard flip data-pressed and
// aria-pressed, pressed wears the accent token.
import { Toggle } from "@orb/ui/toggle";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

const TOUCH_FLOOR_PX = 44;

test("click flips data-pressed / aria-pressed", async ({ mount, page }) => {
  await mount(<Toggle aria-label="Bold">B</Toggle>);
  const control = page.getByRole("button");
  await expect(control).toHaveAttribute("aria-pressed", "false");
  await control.click();
  await expect(control).toHaveAttribute("aria-pressed", "true");
  await expect(control).toHaveAttribute("data-pressed", "");
  await control.click();
  await expect(control).toHaveAttribute("aria-pressed", "false");
});

test("pressed wears the accent token", async ({ mount, page }) => {
  await mount(
    <Toggle aria-label="Bold" defaultPressed={true}>
      B
    </Toggle>,
  );
  const control = page.getByRole("button");
  await expect(control).toHaveAttribute("aria-pressed", "true");
  await expect(control).toHaveCSS("background-color", TOKENS["color.accent"].value);
});

// The neutral pressed fill sits only ΔL≈0.03 above the group surface — the Ember inset-ring is the
// lightness-INDEPENDENT selection cue (side-eye a11y receipt). Clicking (not tabbing) sets pressed
// without a focus-visible ring, so the ONLY box-shadow present is the pressed inset-ring: it carries
// the `inset` keyword and the Ember `--ring` token (= color.primary), neither of which the offset
// focus ring would produce.
test("pressed paints an Ember inset-ring as a non-color selection cue", async ({ mount, page }) => {
  const toggle = await mount(<Toggle aria-label="Bold">B</Toggle>);
  const control = page.getByRole("button");
  await expect(toggle).toHaveCSS("box-shadow", "none");
  await control.click();
  await expect(control).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => await control.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
  await expect.poll(async () => await control.evaluate((el) => getComputedStyle(el).boxShadow)).toContain("inset");
  await expect.poll(async () => await control.evaluate((el) => getComputedStyle(el).boxShadow)).toContain(TOKENS["color.primary"].value);
});

test("onPressedChange reports the next state", async ({ mount, page }) => {
  const seen: boolean[] = [];
  await mount(
    <Toggle
      aria-label="Bold"
      onPressedChange={(pressed): void => {
        seen.push(pressed);
      }}
    >
      B
    </Toggle>,
  );
  await page.getByRole("button").click();
  await expect.poll(() => seen.at(-1), { intervals: [20, 50, 100] }).toBe(true);
});

test("hover shows the accent token", async ({ mount, page }) => {
  const toggle = await mount(<Toggle aria-label="Bold">B</Toggle>);
  await page.getByRole("button").hover();
  await expect(toggle).toHaveCSS("background-color", TOKENS["color.accent"].value);
});

test("keyboard focus shows a focus-visible ring", async ({ mount, page }) => {
  const toggle = await mount(<Toggle aria-label="Bold">B</Toggle>);
  await expect(toggle).toHaveCSS("box-shadow", "none");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button")).toBeFocused();
  await expect.poll(async () => await toggle.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
});

test("disabled is inert and removed from the tab order", async ({ mount, page }) => {
  await mount(
    <div>
      <button type="button">Before</button>
      <Toggle aria-label="Bold" disabled={true}>
        B
      </Toggle>
    </div>,
  );
  const toggle = page.getByRole("button", { name: "Bold" });
  await expect(toggle).toBeDisabled();
  await page.getByRole("button", { name: "Before" }).focus();
  await page.keyboard.press("Tab");
  await expect(toggle).not.toBeFocused();
});

test("Enter and Space toggle pressed from the keyboard", async ({ mount, page }) => {
  await mount(<Toggle aria-label="Bold">B</Toggle>);
  const control = page.getByRole("button");
  await control.focus();
  await page.keyboard.press("Enter");
  await expect(control).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press(" ");
  await expect(control).toHaveAttribute("aria-pressed", "false");
});

// The ≥44px floor is a COARSE-pointer guarantee (D62 P1) — control heights narrow on fine pointers,
// so this runs under an emulated coarse pointer (hasTouch → pointer:coarse, the tokens/index.ct.tsx
// precedent). Without it the default Desktop-Chrome CT is fine and the heights are 28/40, not the floor.
test.describe("coarse pointer — the touch floor", () => {
  test.use({ hasTouch: true });

  test("every size meets the 44px touch floor; lg is taller than sm", async ({ mount }) => {
    const small = await mount(
      <Toggle aria-label="Bold" size="sm">
        B
      </Toggle>,
    );
    const smallBox = await small.boundingBox();
    // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
    expect(smallBox?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
    await small.unmount();
    const large = await mount(
      <Toggle aria-label="Bold" size="lg">
        B
      </Toggle>,
    );
    const largeBox = await large.boundingBox();
    // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
    expect(largeBox?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
    expect(largeBox?.height ?? 0).toBeGreaterThan(smallBox?.height ?? 0);
  });
});
