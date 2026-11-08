import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { computedStyle } from "@orb/testkit/browser/spec";

test("reads", async ({ page }) => {
  expect(await computedStyle(page.locator("a"), "color")).toBe("red");
});
