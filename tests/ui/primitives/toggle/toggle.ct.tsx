// CT: the toggle seal — a two-state pressable button; pointer + keyboard flip data-pressed and
// aria-pressed, pressed wears the accent token.
import { Toggle } from "@orb/ui/toggle";
import { expect, test } from "@playwright/experimental-ct-react";

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
  const background = await control.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).toContain("oklch(0.285 0.02 65)");
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
  await expect.poll(() => seen.at(-1)).toBe(true);
});
