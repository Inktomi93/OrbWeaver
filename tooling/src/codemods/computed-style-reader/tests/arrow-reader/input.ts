import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";

const style = (locator: Locator, property: string): Promise<string> =>
  locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

test("reads", async ({ page }) => {
  expect(await style(page.locator("a"), "color", "::after")).toBe("red");
});
