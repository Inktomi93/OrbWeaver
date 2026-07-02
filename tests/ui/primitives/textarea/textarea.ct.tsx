// CT: the textarea seal — a multi-line control that accepts input and wears the token skin
// (border-border oklch) plus native field-sizing autosize.
import { Textarea } from "@orb/ui/textarea";
import { expect, test } from "@playwright/experimental-ct-react";

test("accepts multi-line input", async ({ mount, page }) => {
  await mount(<Textarea aria-label="Scene" placeholder="Describe the scene…" />);
  const control = page.getByRole("textbox");
  await control.fill("A tavern at dusk.\nRain on the shutters.");
  await expect(control).toHaveValue("A tavern at dusk.\nRain on the shutters.");
});

test("wears the token skin and autosizes to content", async ({ mount, page }) => {
  await mount(<Textarea aria-label="Scene" />);
  const control = page.getByRole("textbox");
  const border = await control.evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(border).toContain("oklch");
  const sizing = await control.evaluate((el) => getComputedStyle(el).fieldSizing);
  expect(sizing).toBe("content");
});
