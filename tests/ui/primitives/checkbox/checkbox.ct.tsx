// CT: the checkbox seal — real role="checkbox" semantics (the styled span carries the role, a
// hidden input rides beside it). Pointer + keyboard toggle aria-checked; checked wears the primary
// token; indeterminate reports aria-checked="mixed".
import { Checkbox } from "@orb/ui/checkbox";
import { expect, test } from "@playwright/experimental-ct-react";

test("click toggles aria-checked", async ({ mount, page }) => {
  await mount(<Checkbox aria-label="Remember me" />);
  const control = page.getByRole("checkbox");
  await expect(control).toHaveAttribute("aria-checked", "false");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("keyboard toggles too, and checked wears the primary token", async ({ mount, page }) => {
  await mount(<Checkbox aria-label="Remember me" defaultChecked={true} />);
  const control = page.getByRole("checkbox");
  await expect(control).toHaveAttribute("aria-checked", "true");
  const background = await control.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).toContain("oklch(0.76 0.145 66)");
  await control.press("Space");
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("indeterminate reports the mixed state", async ({ mount, page }) => {
  await mount(<Checkbox aria-label="Select all" indeterminate={true} />);
  await expect(page.getByRole("checkbox")).toHaveAttribute("aria-checked", "mixed");
});

test("onCheckedChange reports the next state", async ({ mount, page }) => {
  const seen: boolean[] = [];
  await mount(
    <Checkbox
      aria-label="Remember me"
      onCheckedChange={(checked): void => {
        seen.push(checked);
      }}
    />,
  );
  await page.getByRole("checkbox").click();
  await expect.poll(() => seen.at(-1)).toBe(true);
});
